var kolmafia = require('kolmafia');
var myName = kolmafia.myName;
var fileToMap = kolmafia.fileToMap;
var fileToBuffer = kolmafia.fileToBuffer;
var bufferToFile = kolmafia.bufferToFile;
var print = kolmafia.print;
var printHtml = kolmafia.printHtml;
var historicalPrice = kolmafia.historicalPrice;
var historicalAge = kolmafia.historicalAge;
var mallPrice = kolmafia.mallPrice;
var autosellPrice = kolmafia.autosellPrice;
var toItem = kolmafia.toItem;

// Configuration
var ITEM_PRICE_MULTIPLIER = 0.9;

function getDataPath() {
    return "Profit Tracking/" + myName();
}

/**
 * Get item value similar to DicsLibrary.ash itemValue function
 */
function getItemValue(itemId) {
    var item = toItem(itemId);
    if (!item || item.tradeable === false) return 0;
    
    // Check for historical price
    if (historicalAge(item) < 7.0) {
        return Math.floor(historicalPrice(item) * ITEM_PRICE_MULTIPLIER);
    }
    
    var mp = mallPrice(item);
    if (mp > 0) {
        return Math.floor(mp * ITEM_PRICE_MULTIPLIER);
    }
    
    // Fallback to autosell
    return autosellPrice(item);
}

/**
 * Read meat.txt and parse it manually to handle various formats
 * Format can be tab-separated or space-separated:
 * date\tevent\tadv\tmeat\tactivity\ttime
 * or: date event adv meat activity time
 */
function readMeatData() {
    var entries = [];
    
    try {
        var content = fileToBuffer(getDataPath() + "/meat.txt");
        if (!content || content.length === 0) {
            print("meat.txt is empty or not found", "orange");
            return entries;
        }
        
        var lines = content.split('\n');
        var skippedLines = 0;
        
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line) continue;
            
            // Try tab-separated first, then space-separated
            var parts = line.split('\t');
            if (parts.length < 4) {
                // Try space-separated
                parts = line.split(/\s+/);
            }
            
            if (parts.length >= 4) {
                var date = parts[0];
                var event = parts[1];
                var adv = parseInt(parts[2], 10) || 0;
                var meat = parseInt(parts[3], 10) || 0;
                var activity = parts[4] || "";
                var time = parseInt(parts[5], 10) || 0;
                
                // Validate date format (should be 8 digits like 20230117)
                if (/^\d{8}$/.test(date)) {
                    entries.push({
                        date: date,
                        event: event,
                        adv: adv,
                        meat: meat,
                        activity: activity,
                        time: time
                    });
                } else {
                    skippedLines++;
                }
            } else {
                skippedLines++;
            }
        }
        
        if (skippedLines > 0) {
            print("Skipped " + skippedLines + " unparseable lines in meat.txt", "gray");
        }
        
    } catch (e) {
        print("Error reading meat.txt: " + e, "orange");
    }
    
    return entries;
}

/**
 * Read inventory file for a specific date and event
 * Format: itemId\tcount (one per line)
 */
function readInventoryFile(date, event) {
    var inventoryData = {};
    try {
        var filePath = getDataPath() + "/inventory/" + date + " " + event + ".txt";
        var content = fileToBuffer(filePath);
        if (content && content.length > 0) {
            var lines = content.split('\n');
            for (var i = 0; i < lines.length; i++) {
                var line = lines[i].trim();
                if (!line) continue;
                
                // Format: itemId\tcount
                var parts = line.split('\t');
                if (parts.length >= 2) {
                    var itemId = parts[0].trim();
                    var count = parseInt(parts[1].trim(), 10) || 0;
                    if (itemId && count !== 0) {
                        inventoryData[itemId] = count;
                    }
                }
            }
        }
    } catch (e) {
        // File doesn't exist or can't be read
    }
    return inventoryData;
}

/**
 * Calculate total asset value from inventory
 */
function calculateAssetValue(inventoryData) {
    var total = 0;
    var keys = Object.keys(inventoryData);
    for (var i = 0; i < keys.length; i++) {
        var itemKey = keys[i];
        var count = inventoryData[itemKey];
        var value = getItemValue(itemKey);
        total += value * parseInt(count, 10);
    }
    return total;
}

/**
 * Read networth_checkpoints.txt file
 * Format: date\tevent\tmeat\tcalculateditemvalue
 * Keys are [date, event] similar to meat.txt
 */
function readNetworthCheckpoints() {
    var entries = [];
    
    try {
        var content = fileToBuffer(getDataPath() + "/networth_checkpoints.txt");
        if (!content || content.length === 0) {
            return entries;
        }
        
        var lines = content.split('\n');
        var skippedLines = 0;
        
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line) continue;
            
            // Tab-separated: date, event, meat, calculateditemvalue
            var parts = line.split('\t');
            
            if (parts.length >= 4) {
                var date = parts[0];
                var event = parts[1];
                var meat = parseInt(parts[2], 10) || 0;
                var calculateditemvalue = parseInt(parts[3], 10) || 0;
                
                // Validate date format (should be 8 digits like 20230117)
                if (/^\d{8}$/.test(date)) {
                    entries.push({
                        date: date,
                        event: event,
                        meat: meat,
                        calculateditemvalue: calculateditemvalue,
                        accountValue: meat + calculateditemvalue
                    });
                } else {
                    skippedLines++;
                }
            } else {
                skippedLines++;
            }
        }
        
        if (skippedLines > 0) {
            print("Skipped " + skippedLines + " unparseable lines in networth_checkpoints.txt", "gray");
        }
        
    } catch (e) {
        print("Error reading networth_checkpoints.txt: " + e, "orange");
    }
    
    return entries;
}

/**
 * Build data points from networth checkpoint data
 * Uses pre-calculated item values stored at checkpoint time
 */
function buildCheckpointGraphData() {
    print("Reading networth checkpoint data...", "teal");
    
    var entries = readNetworthCheckpoints();
    
    if (entries.length === 0) {
        print("No checkpoint data found in networth_checkpoints.txt", "gray");
        return null;
    }
    
    print("Found " + entries.length + " checkpoint entries", "teal");
    
    // Get unique dates and pick one entry per date (prefer "start", then first available)
    var dateMap = {};
    for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        if (!dateMap[entry.date]) {
            dateMap[entry.date] = [];
        }
        dateMap[entry.date].push(entry);
    }
    
    var dates = Object.keys(dateMap);
    dates.sort();
    
    var dataPoints = [];
    
    for (var d = 0; d < dates.length; d++) {
        var date = dates[d];
        var dayEntries = dateMap[date];
        
        // Prefer "start" event, otherwise use first entry
        var selectedEntry = null;
        for (var j = 0; j < dayEntries.length; j++) {
            if (dayEntries[j].event.toLowerCase() === "start") {
                selectedEntry = dayEntries[j];
                break;
            }
        }
        if (!selectedEntry) {
            selectedEntry = dayEntries[0];
        }
        
        dataPoints.push({
            date: selectedEntry.date,
            displayDate: formatDate(selectedEntry.date),
            liquidMeat: selectedEntry.meat,
            assetValue: selectedEntry.calculateditemvalue,
            totalNetWorth: selectedEntry.accountValue
        });
    }
    
    print("Processed " + dataPoints.length + " checkpoint data points", "teal");
    return dataPoints;
}

/**
 * Generate SVG graph for checkpoint data (historical item values)
 * @param {Array} dataPoints - Array of checkpoint data points
 */
function generateCheckpointSVG(dataPoints) {
    if (!dataPoints || dataPoints.length === 0) {
        return "<p>No checkpoint data to display</p>";
    }
    
    // Graph dimensions
    var width = 1200;
    var height = 500;
    var margin = { top: 60, right: 30, bottom: 60, left: 80 };
    var graphWidth = width - margin.left - margin.right;
    var graphHeight = height - margin.top - margin.bottom;
    
    // Calculate min/max values across all three metrics
    var minValue = 0;
    var maxValue = 0;
    for (var i = 0; i < dataPoints.length; i++) {
        var lm = dataPoints[i].liquidMeat;
        var av = dataPoints[i].assetValue;
        var total = dataPoints[i].totalNetWorth;
        
        if (lm < minValue) minValue = lm;
        if (av < minValue) minValue = av;
        if (total < minValue) minValue = total;
        
        if (lm > maxValue) maxValue = lm;
        if (av > maxValue) maxValue = av;
        if (total > maxValue) maxValue = total;
    }
    var valueRange = maxValue - minValue || 1;
    
    // Scale functions
    function xScale(index) {
        return margin.left + (index / (dataPoints.length - 1 || 1)) * graphWidth;
    }
    function yScale(value) {
        return margin.top + graphHeight - ((value - minValue) / valueRange) * graphHeight;
    }
    
    // Build paths for all three lines
    var meatPath = "M";
    var assetPath = "M";
    var totalPath = "M";
    var totalArea = "M" + xScale(0) + "," + yScale(minValue);
    
    for (var i = 0; i < dataPoints.length; i++) {
        var point = dataPoints[i];
        var x = xScale(i);
        var yMeat = yScale(point.liquidMeat);
        var yAsset = yScale(point.assetValue);
        var yTotal = yScale(point.totalNetWorth);
        
        if (i === 0) {
            meatPath += x + "," + yMeat;
            assetPath += x + "," + yAsset;
            totalPath += x + "," + yTotal;
            totalArea += " L" + x + "," + yTotal;
        } else {
            meatPath += " L" + x + "," + yMeat;
            assetPath += " L" + x + "," + yAsset;
            totalPath += " L" + x + "," + yTotal;
            totalArea += " L" + x + "," + yTotal;
        }
    }
    
    // Close the area path
    totalArea += " L" + xScale(dataPoints.length - 1) + "," + yScale(minValue);
    totalArea += " L" + xScale(0) + "," + yScale(minValue) + " Z";
    
    // Generate Y-axis labels
    var yLabels = [];
    var numYLabels = 6;
    for (var i = 0; i <= numYLabels; i++) {
        var value = minValue + (valueRange * i / numYLabels);
        yLabels.push({
            value: value,
            y: yScale(value),
            label: formatValue(Math.round(value))
        });
    }
    
    // Generate X-axis labels
    var xLabels = [];
    var labelInterval = Math.max(1, Math.floor(dataPoints.length / 12));
    for (var i = 0; i < dataPoints.length; i++) {
        if (i % labelInterval === 0 || i === dataPoints.length - 1) {
            xLabels.push({
                x: xScale(i),
                label: dataPoints[i].displayDate
            });
        }
    }
    
    // Build SVG with purple/violet theme to differentiate from the original graph
    var svg = '<svg width="' + width + '" height="' + height + '" xmlns="http://www.w3.org/2000/svg" style="font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif; background: #fafafa;">\n';
    svg += '    <defs>\n';
    svg += '        <linearGradient id="checkpointGradient" x1="0%" y1="0%" x2="0%" y2="100%">\n';
    svg += '            <stop offset="0%" style="stop-color:#9C27B0;stop-opacity:0.3"/>\n';
    svg += '            <stop offset="100%" style="stop-color:#9C27B0;stop-opacity:0.05"/>\n';
    svg += '        </linearGradient>\n';
    svg += '    </defs>\n';
    svg += '    \n';
    svg += '    <!-- Title -->\n';
    svg += '    <text x="' + (width/2) + '" y="30" text-anchor="middle" font-size="18" font-weight="bold" fill="#333">Net Worth at Checkpoint Time (Historical Item Values)</text>\n';
    svg += '    \n';
    svg += '    <!-- Grid lines -->\n';
    svg += '    <g stroke="#e0e0e0" stroke-width="1">\n';
    
    for (var i = 0; i < yLabels.length; i++) {
        svg += '        <line x1="' + margin.left + '" y1="' + yLabels[i].y + '" x2="' + (width - margin.right) + '" y2="' + yLabels[i].y + '"/>\n';
    }
    
    svg += '    </g>\n';
    svg += '    \n';
    svg += '    <!-- Axes -->\n';
    svg += '    <line x1="' + margin.left + '" y1="' + margin.top + '" x2="' + margin.left + '" y2="' + (height - margin.bottom) + '" stroke="#333" stroke-width="2"/>\n';
    svg += '    <line x1="' + margin.left + '" y1="' + (height - margin.bottom) + '" x2="' + (width - margin.right) + '" y2="' + (height - margin.bottom) + '" stroke="#333" stroke-width="2"/>\n';
    svg += '    \n';
    svg += '    <!-- Y-axis labels -->\n';
    svg += '    <g font-size="12" fill="#666">\n';
    
    for (var i = 0; i < yLabels.length; i++) {
        svg += '        <text x="' + (margin.left - 10) + '" y="' + (yLabels[i].y + 4) + '" text-anchor="end">' + yLabels[i].label + '</text>\n';
    }
    
    svg += '    </g>\n';
    svg += '    \n';
    svg += '    <!-- X-axis labels -->\n';
    svg += '    <g font-size="11" fill="#666">\n';
    
    for (var i = 0; i < xLabels.length; i++) {
        var xPos = xLabels[i].x;
        var yPos = height - margin.bottom + 20;
        svg += '        <text x="' + xPos + '" y="' + yPos + '" text-anchor="middle" transform="rotate(-45, ' + xPos + ', ' + yPos + ')">' + xLabels[i].label + '</text>\n';
    }
    
    svg += '    </g>\n';
    svg += '    \n';
    svg += '    <!-- Account Value area fill -->\n';
    svg += '    <path d="' + totalArea + '" fill="url(#checkpointGradient)"/>\n';
    svg += '    \n';
    svg += '    <!-- Liquid Meat line -->\n';
    svg += '    <path d="' + meatPath + '" fill="none" stroke="#4CAF50" stroke-width="2.5"/>\n';
    svg += '    \n';
    svg += '    <!-- Calculated Item Value line (dashed) -->\n';
    svg += '    <path d="' + assetPath + '" fill="none" stroke="#FF9800" stroke-width="2" stroke-dasharray="8,4"/>\n';
    svg += '    \n';
    svg += '    <!-- Account Value line -->\n';
    svg += '    <path d="' + totalPath + '" fill="none" stroke="#9C27B0" stroke-width="2.5"/>\n';
    svg += '    \n';
    svg += '    <!-- Legend -->\n';
    svg += '    <g transform="translate(' + (margin.left + 20) + ', ' + (margin.top + 10) + ')">\n';
    svg += '        <line x1="0" y1="0" x2="30" y2="0" stroke="#4CAF50" stroke-width="2.5"/>\n';
    svg += '        <text x="40" y="4" font-size="12" fill="#333">Liquid Meat</text>\n';
    svg += '        \n';
    svg += '        <line x1="0" y1="20" x2="30" y2="20" stroke="#FF9800" stroke-width="2" stroke-dasharray="8,4"/>\n';
    svg += '        <text x="40" y="24" font-size="12" fill="#333">Calculated Item Value (at checkpoint time)</text>\n';
    svg += '        \n';
    svg += '        <line x1="0" y1="40" x2="30" y2="40" stroke="#9C27B0" stroke-width="2.5"/>\n';
    svg += '        <text x="40" y="44" font-size="12" fill="#333">Account Value (Meat + Items)</text>\n';
    svg += '    </g>\n';
    svg += '</svg>';
    
    return svg;
}

/**
 * Get all unique dates sorted chronologically
 */
function getUniqueDates(entries) {
    var dateSet = {};
    for (var i = 0; i < entries.length; i++) {
        dateSet[entries[i].date] = true;
    }
    var dates = Object.keys(dateSet);
    dates.sort();
    return dates;
}

/**
 * Format date from YYYYMMDD to YYYY-MM
 */
function formatDate(dateStr) {
    if (dateStr.length === 8) {
        return dateStr.substring(0, 4) + "-" + dateStr.substring(4, 6);
    }
    return dateStr;
}

/**
 * Format large numbers for display
 */
function formatValue(value) {
    var absValue = Math.abs(value);
    if (absValue >= 1000000000) {
        return (value / 1000000000).toFixed(1) + "B";
    } else if (absValue >= 1000000) {
        return (value / 1000000).toFixed(1) + "M";
    } else if (absValue >= 1000) {
        return (value / 1000).toFixed(1) + "K";
    }
    return value.toString();
}

/**
 * Build data points for the graph
 * @param {boolean} includeItems - Whether to calculate item/asset values (slower)
 */
function buildGraphData(includeItems) {
    print("Reading profit tracking data...", "teal");
    if (includeItems) {
        print("Including item values (this may take a while)...", "teal");
    }
    
    var entries = readMeatData();
    
    print("Found " + entries.length + " entries in meat.txt", "teal");
    
    if (entries.length === 0) {
        print("meat.txt appears to be empty or not found", "red");
        print("Expected path: data/Profit Tracking/" + myName() + "/meat.txt", "orange");
        return null;
    }
    
    var dates = getUniqueDates(entries);
    print("Found " + dates.length + " unique days of data", "teal");
    
    // No baseline needed - we show absolute values now
    
    var dataPoints = [];
    var skippedDays = 0;
    var inventoryMissing = 0;
    
    for (var d = 0; d < dates.length; d++) {
        var date = dates[d];
        // Get end-of-day data (prefer "end", fallback to last event)
        var dayEntries = [];
        for (var i = 0; i < entries.length; i++) {
            if (entries[i].date === date) {
                dayEntries.push(entries[i]);
            }
        }
        
        // Try to find "end" event first, then "start"
        var endEntry = null;
        for (var j = 0; j < dayEntries.length; j++) {
            if (dayEntries[j].event.toLowerCase() === "end") {
                endEntry = dayEntries[j];
                break;
            }
        }
        if (!endEntry) {
            for (var j = 0; j < dayEntries.length; j++) {
                if (dayEntries[j].event.toLowerCase() === "start") {
                    endEntry = dayEntries[j];
                    break;
                }
            }
        }
        if (!endEntry && dayEntries.length > 0) {
            endEntry = dayEntries[dayEntries.length - 1];
        }
        
        if (!endEntry) {
            skippedDays++;
            continue;
        }
        
        // Calculate asset value only if includeItems is true
        var assetValue = 0;
        if (includeItems) {
            var inventory = readInventoryFile(date, endEntry.event);
            var inventoryCount = Object.keys(inventory).length;
            
            if (inventoryCount === 0) {
                inventoryMissing++;
            }
            
            assetValue = calculateAssetValue(inventory);
        }
        
        dataPoints.push({
            date: date,
            displayDate: formatDate(date),
            liquidMeat: endEntry.meat,
            assetValue: assetValue,
            totalNetWorth: endEntry.meat + assetValue
        });
    }
    
    if (skippedDays > 0) {
        print("Skipped " + skippedDays + " days with no usable data", "orange");
    }
    if (includeItems && inventoryMissing > 0) {
        print("Note: " + inventoryMissing + " days had no inventory file (asset value = 0)", "orange");
    }
    
    print("Processed " + dataPoints.length + " data points", "teal");
    return dataPoints;
}

/**
 * Generate SVG graph
 * @param {Array} dataPoints - Array of data points
 * @param {boolean} includeItems - Whether item values were included
 */
function generateSVG(dataPoints, includeItems) {
    if (!dataPoints || dataPoints.length === 0) {
        return "<p>No data to display</p>";
    }
    
    // Graph dimensions
    var width = 1200;
    var height = 500;
    var margin = { top: 60, right: 30, bottom: 60, left: 80 };
    var graphWidth = width - margin.left - margin.right;
    var graphHeight = height - margin.top - margin.bottom;
    
    // Calculate min/max values
    var minValue = 0;
    var maxValue = 0;
    for (var i = 0; i < dataPoints.length; i++) {
        var lm = dataPoints[i].liquidMeat;
        if (lm < minValue) minValue = lm;
        if (lm > maxValue) maxValue = lm;
        
        if (includeItems) {
            var av = dataPoints[i].assetValue;
            var total = dataPoints[i].totalNetWorth;
            if (av < minValue) minValue = av;
            if (total < minValue) minValue = total;
            if (av > maxValue) maxValue = av;
            if (total > maxValue) maxValue = total;
        }
    }
    var valueRange = maxValue - minValue || 1;
    
    // Scale functions
    function xScale(index) {
        return margin.left + (index / (dataPoints.length - 1 || 1)) * graphWidth;
    }
    function yScale(value) {
        return margin.top + graphHeight - ((value - minValue) / valueRange) * graphHeight;
    }
    
    // Build paths
    var meatPath = "M";
    var assetPath = "M";
    var totalPath = "M";
    var meatArea = "M" + xScale(0) + "," + yScale(minValue);
    
    for (var i = 0; i < dataPoints.length; i++) {
        var point = dataPoints[i];
        var x = xScale(i);
        var yMeat = yScale(point.liquidMeat);
        
        if (i === 0) {
            meatPath += x + "," + yMeat;
            meatArea += " L" + x + "," + yMeat;
            if (includeItems) {
                var yAsset = yScale(point.assetValue);
                var yTotal = yScale(point.totalNetWorth);
                assetPath += x + "," + yAsset;
                totalPath += x + "," + yTotal;
            }
        } else {
            meatPath += " L" + x + "," + yMeat;
            meatArea += " L" + x + "," + yMeat;
            if (includeItems) {
                var yAsset = yScale(point.assetValue);
                var yTotal = yScale(point.totalNetWorth);
                assetPath += " L" + x + "," + yAsset;
                totalPath += " L" + x + "," + yTotal;
            }
        }
    }
    
    // Close the area path
    meatArea += " L" + xScale(dataPoints.length - 1) + "," + yScale(minValue);
    meatArea += " L" + xScale(0) + "," + yScale(minValue) + " Z";
    
    // Generate Y-axis labels
    var yLabels = [];
    var numYLabels = 6;
    for (var i = 0; i <= numYLabels; i++) {
        var value = minValue + (valueRange * i / numYLabels);
        yLabels.push({
            value: value,
            y: yScale(value),
            label: formatValue(Math.round(value))
        });
    }
    
    // Generate X-axis labels (show every few months)
    var xLabels = [];
    var labelInterval = Math.max(1, Math.floor(dataPoints.length / 12));
    for (var i = 0; i < dataPoints.length; i++) {
        if (i % labelInterval === 0 || i === dataPoints.length - 1) {
            xLabels.push({
                x: xScale(i),
                label: dataPoints[i].displayDate
            });
        }
    }
    
    // Build SVG
    var svg = '<svg width="' + width + '" height="' + height + '" xmlns="http://www.w3.org/2000/svg" style="font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif; background: #fafafa;">\n';
    svg += '    <defs>\n';
    svg += '        <linearGradient id="profitGradient" x1="0%" y1="0%" x2="0%" y2="100%">\n';
    svg += '            <stop offset="0%" style="stop-color:#4CAF50;stop-opacity:0.3"/>\n';
    svg += '            <stop offset="100%" style="stop-color:#4CAF50;stop-opacity:0.05"/>\n';
    svg += '        </linearGradient>\n';
    svg += '    </defs>\n';
    svg += '    \n';
    svg += '    <!-- Title -->\n';
    svg += '    <text x="' + (width/2) + '" y="30" text-anchor="middle" font-size="18" font-weight="bold" fill="#333">Net Worth Tracking</text>\n';
    svg += '    \n';
    svg += '    <!-- Grid lines -->\n';
    svg += '    <g stroke="#e0e0e0" stroke-width="1">\n';
    
    for (var i = 0; i < yLabels.length; i++) {
        svg += '        <line x1="' + margin.left + '" y1="' + yLabels[i].y + '" x2="' + (width - margin.right) + '" y2="' + yLabels[i].y + '"/>\n';
    }
    
    svg += '    </g>\n';
    svg += '    \n';
    svg += '    <!-- Axes -->\n';
    svg += '    <line x1="' + margin.left + '" y1="' + margin.top + '" x2="' + margin.left + '" y2="' + (height - margin.bottom) + '" stroke="#333" stroke-width="2"/>\n';
    svg += '    <line x1="' + margin.left + '" y1="' + (height - margin.bottom) + '" x2="' + (width - margin.right) + '" y2="' + (height - margin.bottom) + '" stroke="#333" stroke-width="2"/>\n';
    svg += '    \n';
    svg += '    <!-- Y-axis labels -->\n';
    svg += '    <g font-size="12" fill="#666">\n';
    
    for (var i = 0; i < yLabels.length; i++) {
        svg += '        <text x="' + (margin.left - 10) + '" y="' + (yLabels[i].y + 4) + '" text-anchor="end">' + yLabels[i].label + '</text>\n';
    }
    
    svg += '    </g>\n';
    svg += '    \n';
    svg += '    <!-- X-axis labels -->\n';
    svg += '    <g font-size="11" fill="#666">\n';
    
    for (var i = 0; i < xLabels.length; i++) {
        var xPos = xLabels[i].x;
        var yPos = height - margin.bottom + 20;
        svg += '        <text x="' + xPos + '" y="' + yPos + '" text-anchor="middle" transform="rotate(-45, ' + xPos + ', ' + yPos + ')">' + xLabels[i].label + '</text>\n';
    }
    
    svg += '    </g>\n';
    svg += '    \n';
    svg += '    <!-- Liquid Meat area fill -->\n';
    svg += '    <path d="' + meatArea + '" fill="url(#profitGradient)"/>\n';
    svg += '    \n';
    svg += '    <!-- Liquid Meat line -->\n';
    svg += '    <path d="' + meatPath + '" fill="none" stroke="#4CAF50" stroke-width="2.5"/>\n';
    svg += '    \n';
    
    if (includeItems) {
        svg += '    <!-- Asset Value line (dashed) -->\n';
        svg += '    <path d="' + assetPath + '" fill="none" stroke="#FF9800" stroke-width="2" stroke-dasharray="8,4"/>\n';
        svg += '    \n';
        svg += '    <!-- Account Value line (dotted) -->\n';
        svg += '    <path d="' + totalPath + '" fill="none" stroke="#2196F3" stroke-width="2" stroke-dasharray="2,2"/>\n';
        svg += '    \n';
    }
    
    svg += '    <!-- Legend -->\n';
    svg += '    <g transform="translate(' + (margin.left + 20) + ', ' + (margin.top + 10) + ')">\n';
    svg += '        <line x1="0" y1="0" x2="30" y2="0" stroke="#4CAF50" stroke-width="2.5"/>\n';
    svg += '        <text x="40" y="4" font-size="12" fill="#333">Liquid Meat Balance</text>\n';
    
    if (includeItems) {
        svg += '        \n';
        svg += '        <line x1="0" y1="20" x2="30" y2="20" stroke="#FF9800" stroke-width="2" stroke-dasharray="8,4"/>\n';
        svg += '        <text x="40" y="24" font-size="12" fill="#333">Asset Value (Items Only)</text>\n';
        svg += '        \n';
        svg += '        <line x1="0" y1="40" x2="30" y2="40" stroke="#2196F3" stroke-width="2" stroke-dasharray="2,2"/>\n';
        svg += '        <text x="40" y="44" font-size="12" fill="#333">Account Value (Meat + Items)</text>\n';
    }
    
    svg += '    </g>\n';
    svg += '</svg>';
    
    return svg;
}

/**
 * Generate full HTML page
 * @param {Array} dataPoints - Array of data points
 * @param {boolean} includeItems - Whether item values were included
 * @param {Array} checkpointDataPoints - Array of checkpoint data points (optional)
 */
function generateHTML(dataPoints, includeItems, checkpointDataPoints) {
    var svg = generateSVG(dataPoints, includeItems);
    var checkpointSvg = checkpointDataPoints ? generateCheckpointSVG(checkpointDataPoints) : null;
    
    // Calculate summary stats
    var summaryHtml = "";
    if (dataPoints && dataPoints.length > 0) {
        var latest = dataPoints[dataPoints.length - 1];
        var first = dataPoints[0];
        var meatChange = latest.liquidMeat - first.liquidMeat;
        var changeColor = meatChange >= 0 ? '#4CAF50' : '#f44336';
        
        // Calculate cumulative absolute gains (sum of all positive day-over-day changes)
        var totalGains = 0;
        var totalLosses = 0;
        for (var i = 1; i < dataPoints.length; i++) {
            var dayChange = dataPoints[i].liquidMeat - dataPoints[i-1].liquidMeat;
            if (dayChange > 0) {
                totalGains += dayChange;
            } else {
                totalLosses += Math.abs(dayChange);
            }
        }
        
        summaryHtml = '\n';
        summaryHtml += '    <div style="max-width: 1200px; margin: 20px auto; padding: 20px; background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">\n';
        summaryHtml += '        <h2 style="margin-top: 0; color: #333;">Summary</h2>\n';
        summaryHtml += '        <table style="width: 100%; border-collapse: collapse;">\n';
        summaryHtml += '            <tr style="background: #f5f5f5;">\n';
        summaryHtml += '                <td style="padding: 10px; border: 1px solid #ddd;"><strong>Data Range</strong></td>\n';
        summaryHtml += '                <td style="padding: 10px; border: 1px solid #ddd;">' + first.displayDate + ' to ' + latest.displayDate + ' (' + dataPoints.length + ' days)</td>\n';
        summaryHtml += '            </tr>\n';
        summaryHtml += '            <tr>\n';
        summaryHtml += '                <td style="padding: 10px; border: 1px solid #ddd;"><strong>Current Liquid Meat</strong></td>\n';
        summaryHtml += '                <td style="padding: 10px; border: 1px solid #ddd;">' + formatValue(latest.liquidMeat) + '</td>\n';
        summaryHtml += '            </tr>\n';
        if (includeItems) {
            summaryHtml += '            <tr style="background: #f5f5f5;">\n';
            summaryHtml += '                <td style="padding: 10px; border: 1px solid #ddd;"><strong>Current Asset Value</strong></td>\n';
            summaryHtml += '                <td style="padding: 10px; border: 1px solid #ddd;">' + formatValue(latest.assetValue) + '</td>\n';
            summaryHtml += '            </tr>\n';
            summaryHtml += '            <tr>\n';
            summaryHtml += '                <td style="padding: 10px; border: 1px solid #ddd;"><strong>Account Value (Meat + Items)</strong></td>\n';
            summaryHtml += '                <td style="padding: 10px; border: 1px solid #ddd; color: #2196F3;"><strong>' + formatValue(latest.totalNetWorth) + '</strong></td>\n';
            summaryHtml += '            </tr>\n';
        }
        summaryHtml += '            <tr style="background: #f5f5f5;">\n';
        summaryHtml += '                <td style="padding: 10px; border: 1px solid #ddd;"><strong>Liquid Meat Earn/Loss</strong></td>\n';
        summaryHtml += '                <td style="padding: 10px; border: 1px solid #ddd; color: ' + changeColor + ';">' + (meatChange >= 0 ? '+' : '') + formatValue(meatChange) + '</td>\n';
        summaryHtml += '            </tr>\n';
        summaryHtml += '            <tr>\n';
        summaryHtml += '                <td style="padding: 10px; border: 1px solid #ddd;"><strong>Total Meat Earned</strong></td>\n';
        summaryHtml += '                <td style="padding: 10px; border: 1px solid #ddd; color: #4CAF50;">+' + formatValue(totalGains) + '</td>\n';
        summaryHtml += '            </tr>\n';
        summaryHtml += '            <tr style="background: #f5f5f5;">\n';
        summaryHtml += '                <td style="padding: 10px; border: 1px solid #ddd;"><strong>Total Meat Spent</strong></td>\n';
        summaryHtml += '                <td style="padding: 10px; border: 1px solid #ddd; color: #f44336;">-' + formatValue(totalLosses) + '</td>\n';
        summaryHtml += '            </tr>\n';
        summaryHtml += '        </table>\n';
        summaryHtml += '    </div>';
    }
    
    // Checkpoint summary
    var checkpointSummaryHtml = "";
    if (checkpointDataPoints && checkpointDataPoints.length > 0) {
        var cpLatest = checkpointDataPoints[checkpointDataPoints.length - 1];
        var cpFirst = checkpointDataPoints[0];
        var cpNetworthChange = cpLatest.totalNetWorth - cpFirst.totalNetWorth;
        var cpChangeColor = cpNetworthChange >= 0 ? '#9C27B0' : '#f44336';
        
        checkpointSummaryHtml = '\n';
        checkpointSummaryHtml += '    <div style="max-width: 1200px; margin: 20px auto; padding: 20px; background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">\n';
        checkpointSummaryHtml += '        <h2 style="margin-top: 0; color: #333;">Checkpoint Summary (Historical Values)</h2>\n';
        checkpointSummaryHtml += '        <table style="width: 100%; border-collapse: collapse;">\n';
        checkpointSummaryHtml += '            <tr style="background: #f5f5f5;">\n';
        checkpointSummaryHtml += '                <td style="padding: 10px; border: 1px solid #ddd;"><strong>Checkpoint Range</strong></td>\n';
        checkpointSummaryHtml += '                <td style="padding: 10px; border: 1px solid #ddd;">' + cpFirst.displayDate + ' to ' + cpLatest.displayDate + ' (' + checkpointDataPoints.length + ' checkpoints)</td>\n';
        checkpointSummaryHtml += '            </tr>\n';
        checkpointSummaryHtml += '            <tr>\n';
        checkpointSummaryHtml += '                <td style="padding: 10px; border: 1px solid #ddd;"><strong>Latest Liquid Meat</strong></td>\n';
        checkpointSummaryHtml += '                <td style="padding: 10px; border: 1px solid #ddd;">' + formatValue(cpLatest.liquidMeat) + '</td>\n';
        checkpointSummaryHtml += '            </tr>\n';
        checkpointSummaryHtml += '            <tr style="background: #f5f5f5;">\n';
        checkpointSummaryHtml += '                <td style="padding: 10px; border: 1px solid #ddd;"><strong>Latest Item Value (at checkpoint)</strong></td>\n';
        checkpointSummaryHtml += '                <td style="padding: 10px; border: 1px solid #ddd;">' + formatValue(cpLatest.assetValue) + '</td>\n';
        checkpointSummaryHtml += '            </tr>\n';
        checkpointSummaryHtml += '            <tr>\n';
        checkpointSummaryHtml += '                <td style="padding: 10px; border: 1px solid #ddd;"><strong>Latest Account Value</strong></td>\n';
        checkpointSummaryHtml += '                <td style="padding: 10px; border: 1px solid #ddd; color: #9C27B0;"><strong>' + formatValue(cpLatest.totalNetWorth) + '</strong></td>\n';
        checkpointSummaryHtml += '            </tr>\n';
        checkpointSummaryHtml += '            <tr style="background: #f5f5f5;">\n';
        checkpointSummaryHtml += '                <td style="padding: 10px; border: 1px solid #ddd;"><strong>Net Worth Change</strong></td>\n';
        checkpointSummaryHtml += '                <td style="padding: 10px; border: 1px solid #ddd; color: ' + cpChangeColor + ';">' + (cpNetworthChange >= 0 ? '+' : '') + formatValue(cpNetworthChange) + '</td>\n';
        checkpointSummaryHtml += '            </tr>\n';
        checkpointSummaryHtml += '        </table>\n';
        checkpointSummaryHtml += '    </div>';
    }
    
    var today = new Date();
    var month = today.getMonth() + 1;
    var day = today.getDate();
    var dateStr = today.getFullYear() + '-' + (month < 10 ? '0' : '') + month + '-' + (day < 10 ? '0' : '') + day;
    
    var html = '<!DOCTYPE html>\n';
    html += '<html lang="en">\n';
    html += '<head>\n';
    html += '    <meta charset="UTF-8">\n';
    html += '    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n';
    html += '    <title>KoL Net Worth Tracking - ' + myName() + '</title>\n';
    html += '    <style>\n';
    html += '        body {\n';
    html += '            font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif;\n';
    html += '            margin: 0;\n';
    html += '            padding: 20px;\n';
    html += '            background: #f0f0f0;\n';
    html += '        }\n';
    html += '        .container {\n';
    html += '            max-width: 1200px;\n';
    html += '            margin: 0 auto;\n';
    html += '        }\n';
    html += '        .graph-container {\n';
    html += '            background: white;\n';
    html += '            border-radius: 8px;\n';
    html += '            padding: 20px;\n';
    html += '            box-shadow: 0 2px 4px rgba(0,0,0,0.1);\n';
    html += '            margin-bottom: 20px;\n';
    html += '        }\n';
    html += '        h1 {\n';
    html += '            color: #333;\n';
    html += '            text-align: center;\n';
    html += '        }\n';
    html += '        .generated {\n';
    html += '            text-align: center;\n';
    html += '            color: #666;\n';
    html += '            font-size: 12px;\n';
    html += '            margin-top: 20px;\n';
    html += '        }\n';
    html += '    </style>\n';
    html += '</head>\n';
    html += '<body>\n';
    html += '    <div class="container">\n';
    html += '        <h1>Net Worth Tracking for ' + myName() + '</h1>\n';
    html += '        <div class="graph-container">\n';
    html += '            ' + svg + '\n';
    html += '        </div>\n';
    html += summaryHtml + '\n';
    
    // Add checkpoint graph if data exists
    if (checkpointSvg) {
        html += '        <div class="graph-container" style="margin-top: 40px;">\n';
        html += '            ' + checkpointSvg + '\n';
        html += '        </div>\n';
        html += checkpointSummaryHtml + '\n';
    }
    
    html += '        <p class="generated">Generated on ' + dateStr + ' by networth_graph.js</p>\n';
    html += '    </div>\n';
    html += '</body>\n';
    html += '</html>';
    
    return html;
}

/**
 * Main function
 * @param {string} args - "items" to include item values, empty for meat-only (faster)
 */
function main(args) {
    var includeItems = (args && args.toLowerCase() === "items");
    
    print("=== Net Worth Graph Generator ===", "teal");
    if (includeItems) {
        print("Mode: Full (including item values - slower)", "teal");
    } else {
        print("Mode: Meat only (fast). Use 'ptrack graphWithItems' to include item values.", "gray");
    }
    print("Building graph data from profit tracking files...", "teal");
    
    var dataPoints = buildGraphData(includeItems);
    
    if (!dataPoints || dataPoints.length === 0) {
        print("No data found to generate graph.", "red");
        print("Make sure you have been using ptrack to log breakpoints.", "red");
        return;
    }
    
    // Build checkpoint data (uses pre-calculated item values from checkpoint time)
    var checkpointDataPoints = buildCheckpointGraphData();
    
    var html = generateHTML(dataPoints, includeItems, checkpointDataPoints);
    
    // Print summary
    print("Graph data processed successfully!", "green");
    print("Data points: " + dataPoints.length, "teal");
    
    if (dataPoints.length > 0) {
        var latest = dataPoints[dataPoints.length - 1];
        var first = dataPoints[0];
        var meatChange = latest.liquidMeat - first.liquidMeat;
        
        // Calculate cumulative absolute gains
        var totalGains = 0;
        var totalLosses = 0;
        for (var i = 1; i < dataPoints.length; i++) {
            var dayChange = dataPoints[i].liquidMeat - dataPoints[i-1].liquidMeat;
            if (dayChange > 0) {
                totalGains += dayChange;
            } else {
                totalLosses += Math.abs(dayChange);
            }
        }
        
        print("Latest data: " + latest.date, "teal");
        print("  Liquid Meat: " + formatValue(latest.liquidMeat), "teal");
        if (includeItems) {
            print("  Asset Value (Items): " + formatValue(latest.assetValue), "teal");
            print("  Account Value (Total): " + formatValue(latest.totalNetWorth), "teal");
        }
        print("  Liquid Meat Earn/Loss: " + (meatChange >= 0 ? "+" : "") + formatValue(meatChange), "teal");
        print("  Total Meat Earned: +" + formatValue(totalGains), "green");
        print("  Total Meat Spent: -" + formatValue(totalLosses), "red");
    }
    
    // Print checkpoint summary
    if (checkpointDataPoints && checkpointDataPoints.length > 0) {
        print("", "teal");
        print("=== Checkpoint Data (Historical Item Values) ===", "purple");
        print("Checkpoint data points: " + checkpointDataPoints.length, "teal");
        var cpLatest = checkpointDataPoints[checkpointDataPoints.length - 1];
        var cpFirst = checkpointDataPoints[0];
        print("Latest checkpoint: " + cpLatest.date, "teal");
        print("  Liquid Meat: " + formatValue(cpLatest.liquidMeat), "teal");
        print("  Item Value (at checkpoint): " + formatValue(cpLatest.assetValue), "teal");
        print("  Account Value: " + formatValue(cpLatest.totalNetWorth), "purple");
        var cpChange = cpLatest.totalNetWorth - cpFirst.totalNetWorth;
        print("  Net Worth Change: " + (cpChange >= 0 ? "+" : "") + formatValue(cpChange), cpChange >= 0 ? "green" : "red");
    }
    
    // Save HTML to file
    var outputPath = "networth_graph_" + myName() + ".html";
    try {
        var success = bufferToFile(html, outputPath);
        if (success) {
            print("", "teal");
            print("Graph saved to: data/" + outputPath, "green");
            print("Open this file in your browser to view the graph!", "teal");
        } else {
            print("Could not save file, displaying in relay browser instead.", "orange");
            printHtml(html);
        }
    } catch (e) {
        print("Error saving file: " + e, "orange");
        print("Displaying in relay browser instead.", "teal");
        printHtml(html);
    }
}

module.exports.main = main;
