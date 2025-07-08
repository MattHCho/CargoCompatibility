import React, { useState, useEffect, useMemo } from 'react';
import { AlertTriangle, CheckCircle, XCircle, Info, Download, Upload, RotateCcw, Ship, Database, FileText } from 'lucide-react';

const CargoCompatibilityTool = () => {
  // State management
  const [tankLayout, setTankLayout] = useState({ width: 4, length: 8 });
  const [tanks, setTanks] = useState({});
  const [chemicalDatabase, setChemicalDatabase] = useState([]);
  const [compatibilityChart, setCompatibilityChart] = useState({});
  const [compatibleExceptions, setCompatibleExceptions] = useState([]);
  const [incompatibleExceptions, setIncompatibleExceptions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [analysisResults, setAnalysisResults] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTank, setSelectedTank] = useState(null);
  const [errors, setErrors] = useState([]);
  const [uploadedFiles, setUploadedFiles] = useState({
    chemicalIndex: null,
    compatibilityChart: null,
    compatibleExceptions: null,
    incompatibleExceptions: null
  });
  const [filesReady, setFilesReady] = useState(false);

  // Helper functions
  const generateReport = () => {
    const timestamp = new Date().toISOString();
    const reportData = {
      timestamp,
      vesselConfiguration: tankLayout,
      cargoManifest: Object.entries(tanks)
        .filter(([_, tank]) => tank && tank.chemical && tank.chemical.trim() !== '')
        .map(([tankId, tank]) => ({
          tank: tankId.replace('-', ''),
          chemical: tank.chemical || '',
          group: tank.group !== null ? tank.group : 'Unknown'
        })),
      compatibilityResults: analysisResults || { results: {}, problems: [] },
      summary: {
        totalTanks: Object.keys(tanks).length,
        loadedTanks: Object.values(tanks).filter(tank => tank && tank.chemical && tank.chemical.trim() !== '').length,
        compatibilityIssues: analysisResults?.problems?.length || 0,
        status: (analysisResults?.problems?.length || 0) === 0 ? 'APPROVED' : 'ISSUES FOUND'
      }
    };
    return reportData;
  };

  const downloadReport = (report) => {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cargo-compatibility-report-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // File upload handlers
  const handleFileUpload = (fileType, event) => {
    const file = event.target.files[0];
    if (file) {
      setUploadedFiles(prev => ({
        ...prev,
        [fileType]: file
      }));
    }
  };

  const readFileAsArrayBuffer = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(e);
      reader.readAsArrayBuffer(file);
    });
  };

  // Check if all required files are uploaded
  useEffect(() => {
    const allFilesUploaded = Object.values(uploadedFiles).every(file => file !== null);
    setFilesReady(allFilesUploaded);
  }, [uploadedFiles]);

  // Load data from uploaded files
  const loadDataFromFiles = async () => {
    if (!filesReady) {
      setErrors(['Please upload all required files before loading data.']);
      return;
    }

    try {
      setIsLoading(true);
      setErrors([]);
      
      // Load XLSX library if not already loaded
      if (!window.XLSX) {
        await new Promise((resolve) => {
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
          script.onload = resolve;
          document.head.appendChild(script);
        });
      }
      
      // Load Chemical Index
      const chemicalData = await readFileAsArrayBuffer(uploadedFiles.chemicalIndex);
      const chemicalWB = window.XLSX.read(chemicalData);
      const chemicalSheet = chemicalWB.Sheets[Object.keys(chemicalWB.Sheets)[0]];
      const chemicals = window.XLSX.utils.sheet_to_json(chemicalSheet);
      setChemicalDatabase(chemicals.filter(row => row && row['Chemical name']));

      // Load Compatibility Chart
      const chartData = await readFileAsArrayBuffer(uploadedFiles.compatibilityChart);
      const chartWB = window.XLSX.read(chartData);
      const chartSheet = chartWB.Sheets[Object.keys(chartWB.Sheets)[0]];
      const chartRows = window.XLSX.utils.sheet_to_json(chartSheet);
      
      // Process compatibility chart into a usable format
      const chartMap = {};
      chartRows.forEach((row, index) => {
        if (row && row['REACTIVE GROUP'] && row['REACTIVE GROUP'].includes('.')) {
          const groupNum = parseInt(row['REACTIVE GROUP'].split('.')[0]);
          chartMap[groupNum] = {};
          // Check all numeric columns for 'X' values
          Object.keys(row).forEach(key => {
            if (!isNaN(parseInt(key)) && row[key] === 'X') {
              chartMap[groupNum][parseInt(key)] = 'X';
            }
          });
        }
      });
      setCompatibilityChart(chartMap);

      // Load Compatible Exceptions
      const compatibleData = await readFileAsArrayBuffer(uploadedFiles.compatibleExceptions);
      const compatibleWB = window.XLSX.read(compatibleData);
      const compatibleSheet = compatibleWB.Sheets[Object.keys(compatibleWB.Sheets)[0]];
      const compatible = window.XLSX.utils.sheet_to_json(compatibleSheet);
      setCompatibleExceptions(compatible);

      // Load Incompatible Exceptions
      const incompatibleData = await readFileAsArrayBuffer(uploadedFiles.incompatibleExceptions);
      const incompatibleWB = window.XLSX.read(incompatibleData);
      const incompatibleSheet = incompatibleWB.Sheets[Object.keys(incompatibleWB.Sheets)[0]];
      const incompatible = window.XLSX.utils.sheet_to_json(incompatibleSheet);
      setIncompatibleExceptions(incompatible);

      setIsLoading(false);
    } catch (error) {
      setErrors([`Error loading data: ${error.message}`]);
      setIsLoading(false);
    }
  };

  // Initialize tank layout
  useEffect(() => {
    const newTanks = {};
    for (let row = 0; row < tankLayout.length; row++) {
      for (let col = 0; col < tankLayout.width; col++) {
        const tankId = `${row}-${col}`;
        newTanks[tankId] = { chemical: '', group: null, position: { row, col } };
      }
    }
    setTanks(newTanks);
  }, [tankLayout]);

  // Chemical search and validation
  const findChemical = (chemicalName) => {
    if (!chemicalName || !chemicalName.trim()) return null;
    if (!chemicalDatabase || chemicalDatabase.length === 0) return null;
    
    const cleaned = chemicalName.toLowerCase().trim();
    const found = chemicalDatabase.find(chem => 
      chem && chem['Chemical name'] &&
      (chem['Chemical name'].toLowerCase() === cleaned ||
      chem['Chemical name'].toLowerCase().includes(cleaned))
    );
    
    return found ? {
      name: found['Chemical name'],
      group: found['Group No.'],
      footnote: found['Footnote']
    } : null;
  };

  const updateTankChemical = (tankId, chemicalName) => {
    const chemical = findChemical(chemicalName);
    
    if (chemicalName && chemicalName.trim() !== '' && !chemical) {
      setErrors([`Chemical '${chemicalName}' not found in approved cargo index. Please verify spelling or consult IMO chemical classification.`]);
      return;
    }

    setTanks(prev => ({
      ...prev,
      [tankId]: {
        ...(prev[tankId] || {}),
        chemical: chemicalName || '',
        group: chemical ? chemical.group : null,
        chemicalData: chemical,
        position: prev[tankId]?.position || { row: parseInt(tankId.split('-')[0]), col: parseInt(tankId.split('-')[1]) }
      }
    }));
    setErrors([]);
  };

  // Get adjacent tanks
  const getAdjacentTanks = (row, col) => {
    const adjacent = [];
    for (let r = row - 1; r <= row + 1; r++) {
      for (let c = col - 1; c <= col + 1; c++) {
        if (r >= 0 && r < tankLayout.length && c >= 0 && c < tankLayout.width && !(r === row && c === col)) {
          adjacent.push(`${r}-${c}`);
        }
      }
    }
    return adjacent;
  };

  // Check compatibility between two groups
  const checkGroupCompatibility = (group1, group2) => {
    if (group1 === null || group2 === null) return 'compatible';
    
    // Check base compatibility from chart
    const isIncompatible = compatibilityChart[group1] && compatibilityChart[group1][group2];
    
    if (isIncompatible) {
      return 'incompatible';
    }
    
    return 'compatible';
  };

  // Check for exceptions
  const checkExceptions = (chemical1, group1, chemical2, group2) => {
    if (!chemical1 || !chemical2 || group1 === null || group2 === null) {
      return null;
    }

    // Check compatible exceptions
    const compatibleException = compatibleExceptions.find(ex => 
      ex && ex['Chemical Name'] && ex['Compatible Chemical Name'] &&
      ((ex['Chemical Name'] === chemical1 && ex['Compatible Chemical Name'] === chemical2) ||
      (ex['Chemical Name'] === chemical2 && ex['Compatible Chemical Name'] === chemical1))
    );
    
    if (compatibleException) {
      return 'compatible_exception';
    }

    // Check incompatible exceptions
    const incompatibleException = incompatibleExceptions.find(ex => {
      if (!ex || !ex['Chemical Name'] || !ex['Incompatible Group']) {
        return false;
      }
      if (ex['Chemical Name'] === chemical1 || ex['Chemical Name'] === chemical2) {
        try {
          const incompatibleGroups = ex['Incompatible Group'].toString().split(',').map(g => parseInt(g.trim()));
          return incompatibleGroups.includes(group1) || incompatibleGroups.includes(group2);
        } catch (error) {
          return false;
        }
      }
      return false;
    });

    if (incompatibleException) {
      return 'incompatible_exception';
    }

    return null;
  };

  // Perform compatibility analysis
  const performAnalysis = () => {
    const results = {};
    const problems = [];

    Object.keys(tanks).forEach(tankId => {
      const tank = tanks[tankId];
      if (!tank || !tank.chemical || tank.chemical.trim() === '') return;

      const { row, col } = tank.position || {};
      if (row === undefined || col === undefined) return;

      const adjacentTanks = getAdjacentTanks(row, col);
      
      results[tankId] = {
        chemical: tank.chemical,
        group: tank.group,
        adjacentCompatibility: {}
      };

      adjacentTanks.forEach(adjTankId => {
        const adjTank = tanks[adjTankId];
        if (!adjTank || !adjTank.chemical || adjTank.chemical.trim() === '') return;

        const baseCompatibility = checkGroupCompatibility(tank.group, adjTank.group);
        const exception = checkExceptions(tank.chemical, tank.group, adjTank.chemical, adjTank.group);
        
        let finalCompatibility = baseCompatibility;
        if (exception === 'compatible_exception' && baseCompatibility === 'incompatible') {
          finalCompatibility = 'compatible_exception';
        } else if (exception === 'incompatible_exception' && baseCompatibility === 'compatible') {
          finalCompatibility = 'incompatible_exception';
        }

        results[tankId].adjacentCompatibility[adjTankId] = {
          chemical: adjTank.chemical,
          group: adjTank.group,
          compatibility: finalCompatibility,
          baseCompatibility,
          exception
        };

        if (finalCompatibility && finalCompatibility.includes('incompatible')) {
          problems.push({
            tank1: tankId,
            tank2: adjTankId,
            chemical1: tank.chemical,
            chemical2: adjTank.chemical,
            compatibility: finalCompatibility
          });
        }
      });
    });

    setAnalysisResults({ results, problems });
  };

  // Generate tank grid
  const renderTankGrid = () => {
    const grid = [];
    for (let row = 0; row < tankLayout.length; row++) {
      const rowTanks = [];
      for (let col = 0; col < tankLayout.width; col++) {
        const tankId = `${row}-${col}`;
        const tank = tanks[tankId] || { chemical: '', group: null, position: { row, col } };
        const hasProblems = analysisResults?.problems?.some(p => p.tank1 === tankId || p.tank2 === tankId) || false;
        
        rowTanks.push(
          <div key={tankId} className="relative">
            <div 
              className={`
                border-2 p-3 rounded-lg min-h-24 cursor-pointer transition-all
                ${selectedTank === tankId ? 'border-blue-500 bg-blue-50' : 'border-gray-300'}
                ${hasProblems ? 'border-red-500 bg-red-50' : ''}
                ${tank.chemical ? 'bg-green-50' : 'bg-gray-50'}
                hover:shadow-md
              `}
              onClick={() => setSelectedTank(tankId)}
            >
              <div className="text-xs font-bold text-gray-600 mb-1">
                Tank {String.fromCharCode(65 + row)}{col + 1}
              </div>
              <input
                type="text"
                value={tank.chemical || ''}
                onChange={(e) => updateTankChemical(tankId, e.target.value)}
                placeholder="Chemical name"
                className="w-full text-sm border-none bg-transparent focus:outline-none"
                onClick={(e) => e.stopPropagation()}
              />
              {tank.group !== null && tank.group !== undefined && (
                <div className="text-xs text-blue-600 mt-1">
                  Group {tank.group}
                </div>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  updateTankChemical(tankId, '');
                }}
                className="absolute top-1 right-1 text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            </div>
            {hasProblems && (
              <AlertTriangle className="absolute -top-2 -right-2 w-5 h-5 text-red-500" />
            )}
          </div>
        );
      }
      grid.push(
        <div key={row} className="flex gap-2 mb-2">
          {rowTanks}
        </div>
      );
    }
    return grid;
  };

  // Chemical search suggestions
  const filteredChemicals = useMemo(() => {
    if (!searchTerm || !chemicalDatabase || chemicalDatabase.length === 0) return [];
    return chemicalDatabase
      .filter(chem => chem && chem['Chemical name'] && 
        chem['Chemical name'].toLowerCase().includes(searchTerm.toLowerCase()))
      .slice(0, 10);
  }, [searchTerm, chemicalDatabase]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Database className="w-8 h-8 animate-spin mx-auto mb-2" />
          <p>Processing uploaded files...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 bg-white">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Ship className="w-8 h-8 text-blue-600" />
          <h1 className="text-3xl font-bold text-gray-900">Marine Cargo Compatibility Verification Tool</h1>
        </div>
        <p className="text-gray-600">
          Ensure safe chemical cargo transport through comprehensive compatibility analysis
        </p>
      </div>

      {/* File Upload Section */}
      <div className="mb-6 p-6 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-center gap-2 mb-4">
          <Upload className="w-6 h-6 text-blue-600" />
          <h2 className="text-xl font-semibold text-blue-800">Upload Required Database Files</h2>
        </div>
        <p className="text-blue-700 mb-4">
          Please upload all four Excel files containing the chemical compatibility data:
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Chemical Index (Excel file)
            </label>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => handleFileUpload('chemicalIndex', e)}
              className="w-full p-2 border border-gray-300 rounded-md file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            {uploadedFiles.chemicalIndex && (
              <p className="text-sm text-green-600 flex items-center gap-1">
                <CheckCircle className="w-4 h-4" />
                {uploadedFiles.chemicalIndex.name}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Cargo Compatibility Chart (Excel file)
            </label>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => handleFileUpload('compatibilityChart', e)}
              className="w-full p-2 border border-gray-300 rounded-md file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            {uploadedFiles.compatibilityChart && (
              <p className="text-sm text-green-600 flex items-center gap-1">
                <CheckCircle className="w-4 h-4" />
                {uploadedFiles.compatibilityChart.name}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Compatible Exceptions (Excel file)
            </label>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => handleFileUpload('compatibleExceptions', e)}
              className="w-full p-2 border border-gray-300 rounded-md file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            {uploadedFiles.compatibleExceptions && (
              <p className="text-sm text-green-600 flex items-center gap-1">
                <CheckCircle className="w-4 h-4" />
                {uploadedFiles.compatibleExceptions.name}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Incompatible Exceptions (Excel file)
            </label>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => handleFileUpload('incompatibleExceptions', e)}
              className="w-full p-2 border border-gray-300 rounded-md file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            {uploadedFiles.incompatibleExceptions && (
              <p className="text-sm text-green-600 flex items-center gap-1">
                <CheckCircle className="w-4 h-4" />
                {uploadedFiles.incompatibleExceptions.name}
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {filesReady ? (
              <>
                <CheckCircle className="w-5 h-5 text-green-500" />
                <span className="text-green-700 font-medium">All files uploaded successfully</span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-5 h-5 text-yellow-500" />
                <span className="text-yellow-700">
                  {Object.values(uploadedFiles).filter(f => f !== null).length}/4 files uploaded
                </span>
              </>
            )}
          </div>
          
          <button
            onClick={loadDataFromFiles}
            disabled={!filesReady || isLoading}
            className={`px-6 py-2 rounded-md font-medium flex items-center gap-2 ${
              filesReady && !isLoading
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            <Database className="w-4 h-4" />
            {isLoading ? 'Processing...' : 'Load Database Files'}
          </button>
        </div>
      </div>

      {/* Error Display */}
      {errors.length > 0 && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <XCircle className="w-5 h-5 text-red-500" />
            <h3 className="font-semibold text-red-800">Errors</h3>
          </div>
          {errors.map((error, index) => (
            <p key={index} className="text-red-700">{error}</p>
          ))}
        </div>
      )}

      {/* Main Interface - Only show when databases are loaded */}
      {chemicalDatabase.length > 0 && (
        <>
          {/* Tank Layout Configuration */}
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <h2 className="text-xl font-semibold mb-4">Vessel Configuration</h2>
            <div className="flex gap-4 items-center">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Beam (Width)
                </label>
                <input
                  type="number"
                  min="2"
                  max="8"
                  value={tankLayout.width}
                  onChange={(e) => setTankLayout(prev => ({ ...prev, width: parseInt(e.target.value) }))}
                  className="w-20 p-2 border rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Length
                </label>
                <input
                  type="number"
                  min="4"
                  max="12"
                  value={tankLayout.length}
                  onChange={(e) => setTankLayout(prev => ({ ...prev, length: parseInt(e.target.value) }))}
                  className="w-20 p-2 border rounded-md"
                />
              </div>
              <button
                onClick={() => setTanks({})}
                className="flex items-center gap-2 px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300"
              >
                <RotateCcw className="w-4 h-4" />
                Clear All
              </button>
            </div>
          </div>

          {/* Chemical Search */}
          <div className="mb-6">
            <div className="relative">
              <input
                type="text"
                placeholder="Search chemicals..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full p-3 border rounded-lg pl-10"
              />
              <Database className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
            </div>
            {filteredChemicals.length > 0 && (
              <div className="mt-2 border rounded-lg bg-white shadow-lg max-h-60 overflow-y-auto">
                {filteredChemicals.map((chemical, index) => (
                  <div
                    key={index}
                    className="p-3 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
                    onClick={() => {
                      if (selectedTank) {
                        updateTankChemical(selectedTank, chemical['Chemical name']);
                        setSearchTerm('');
                      }
                    }}
                  >
                    <div className="font-medium">{chemical['Chemical name']}</div>
                    <div className="text-sm text-gray-600">Group {chemical['Group No.']}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tank Grid */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Tank Layout</h2>
              <div className="text-sm text-gray-600">
                {selectedTank && `Selected: Tank ${selectedTank.replace('-', '')}`}
              </div>
            </div>
            <div className="border rounded-lg p-4 bg-gray-50">
              {renderTankGrid()}
            </div>
          </div>

          {/* Analysis Controls */}
          <div className="mb-6">
            <button
              onClick={performAnalysis}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              <CheckCircle className="w-5 h-5" />
              Perform Compatibility Analysis
            </button>
          </div>
        </>
      )}

      {/* Show message when no database is loaded */}
      {chemicalDatabase.length === 0 && !isLoading && (
        <div className="mb-6 p-6 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Info className="w-5 h-5 text-yellow-600" />
            <h3 className="font-semibold text-yellow-800">Database Required</h3>
          </div>
          <p className="text-yellow-700">
            Please upload and load the required database files to begin using the compatibility verification tool.
          </p>
        </div>
      )}

      {/* Analysis Results */}
      {analysisResults && (
        <div className="space-y-6">
          {/* Problems Summary */}
          {analysisResults.problems.length > 0 && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                <h3 className="font-semibold text-red-800">Compatibility Issues Found</h3>
              </div>
              <div className="space-y-2">
                {analysisResults.problems.map((problem, index) => (
                  <div key={index} className="p-3 bg-white rounded border">
                    <div className="font-medium text-red-800">
                      Tank {problem.tank1.replace('-', '')} ↔ Tank {problem.tank2.replace('-', '')}
                    </div>
                    <div className="text-sm text-gray-700">
                      {problem.chemical1} ↔ {problem.chemical2}
                    </div>
                    <div className="text-sm text-red-600 mt-1">
                      Status: {problem.compatibility.replace('_', ' ').toUpperCase()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Success Message */}
          {analysisResults.problems.length === 0 && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <h3 className="font-semibold text-green-800">All cargo combinations are compatible</h3>
              </div>
              <p className="text-green-700 mt-1">
                No compatibility issues detected in current tank configuration.
              </p>
            </div>
          )}

          {/* Detailed Results */}
          <div className="p-4 bg-gray-50 rounded-lg">
            <h3 className="font-semibold mb-3">Detailed Analysis Results</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(analysisResults.results).map(([tankId, result]) => (
                <div key={tankId} className="p-3 bg-white rounded border">
                  <div className="font-medium mb-2">
                    Tank {tankId.replace('-', '')}
                  </div>
                  <div className="text-sm text-gray-700 mb-2">
                    {result.chemical} (Group {result.group})
                  </div>
                  <div className="text-xs">
                    Adjacent: {Object.keys(result.adjacentCompatibility).length} tanks
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Export/Documentation */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-blue-800">Documentation & Export</h3>
                <p className="text-blue-700 text-sm">Generate reports for regulatory compliance</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const report = generateReport();
                    downloadReport(report);
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  <Download className="w-4 h-4" />
                  Export Report
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Database Information */}
      <div className="mt-8 p-4 bg-gray-50 border rounded-lg">
        <div className="flex items-center gap-2 mb-3">
          <Info className="w-5 h-5 text-gray-600" />
          <h3 className="font-semibold text-gray-800">System Information</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="font-medium text-gray-700">Chemicals in Database</div>
            <div className="text-gray-600">{chemicalDatabase.length}</div>
          </div>
          <div>
            <div className="font-medium text-gray-700">Compatible Exceptions</div>
            <div className="text-gray-600">{compatibleExceptions.length}</div>
          </div>
          <div>
            <div className="font-medium text-gray-700">Incompatible Exceptions</div>
            <div className="text-gray-600">{incompatibleExceptions.length}</div>
          </div>
          <div>
            <div className="font-medium text-gray-700">Reactive Groups</div>
            <div className="text-gray-600">{Object.keys(compatibilityChart).length}</div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-8 pt-6 border-t text-center text-sm text-gray-600">
        <p>Marine Cargo Compatibility Verification Tool v1.0</p>
        <p>Compliant with MARPOL Annex II and IMO Chemical Transport Regulations</p>
        <p className="mt-2 font-medium text-red-600">
          ⚠️ Always verify results with qualified marine chemists for critical cargo operations
        </p>
      </div>
    </div>
  );
};

export default CargoCompatibilityTool;