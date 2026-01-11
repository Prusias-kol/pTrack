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
var DATA_PATH = "Profit Tracking/" + myName();

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
        var content = fileToBuffer(DATA_PATH + "/meat.txt");
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
 */
function readInventoryFile(date, event) {
    var inventoryData = {};
    try {
        fileToMap(DATA_PATH + "/inventory/" + date + " " + event + ".txt", inventoryData);
    } catch (e) {
        // File doesn't exist
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
 */
function buildGraphData() {
    print("Reading profit tracking data...", "blue");
    
    var entries = readMeatData();
    
    print("Found " + entries.length + " entries in meat.txt", "blue");
    
    if (entries.length === 0) {
        print("meat.txt appears to be empty or not found", "red");
        print("Expected path: data/Profit Tracking/" + myName() + "/meat.txt", "orange");
        return null;
    }
    
    var dates = getUniqueDates(entries);
    print("Found " + dates.length + " unique days of data", "blue");
    
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
        
        // Calculate asset value
        var inventory = readInventoryFile(date, endEntry.event);
        var inventoryCount = Object.keys(inventory).length;
        
        if (inventoryCount === 0) {
            inventoryMissing++;
        }
        
        var assetValue = calculateAssetValue(inventory);
        
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
    if (inventoryMissing > 0) {
        print("Note: " + inventoryMissing + " days had no inventory file (asset value = 0)", "orange");
    }
    
    print("Processed " + dataPoints.length + " data points", "blue");
    return dataPoints;
}

/**
 * Generate SVG graph
 */
function generateSVG(dataPoints) {
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
        var av = dataPoints[i].assetValue;
        if (lm < minValue) minValue = lm;
        if (av < minValue) minValue = av;
        if (lm > maxValue) maxValue = lm;
        if (av > maxValue) maxValue = av;
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
    var meatArea = "M" + xScale(0) + "," + yScale(minValue);
    
    for (var i = 0; i < dataPoints.length; i++) {
        var point = dataPoints[i];
        var x = xScale(i);
        var yMeat = yScale(point.liquidMeat);
        var yAsset = yScale(point.assetValue);
        
        if (i === 0) {
            meatPath += x + "," + yMeat;
            assetPath += x + "," + yAsset;
            meatArea += " L" + x + "," + yMeat;
        } else {
            meatPath += " L" + x + "," + yMeat;
            assetPath += " L" + x + "," + yAsset;
            meatArea += " L" + x + "," + yMeat;
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
    svg += '    <!-- Asset Value line (dashed) -->\n';
    svg += '    <path d="' + assetPath + '" fill="none" stroke="#FF9800" stroke-width="2" stroke-dasharray="8,4"/>\n';
    svg += '    \n';
    svg += '    <!-- Legend -->\n';
    svg += '    <g transform="translate(' + (margin.left + 20) + ', ' + (margin.top + 10) + ')">\n';
    svg += '        <line x1="0" y1="0" x2="30" y2="0" stroke="#4CAF50" stroke-width="2.5"/>\n';
    svg += '        <text x="40" y="4" font-size="12" fill="#333">Liquid Meat Balance</text>\n';
    svg += '        \n';
    svg += '        <line x1="0" y1="20" x2="30" y2="20" stroke="#FF9800" stroke-width="2" stroke-dasharray="8,4"/>\n';
    svg += '        <text x="40" y="24" font-size="12" fill="#333">Asset Value (Estimated)</text>\n';
    svg += '    </g>\n';
    svg += '</svg>';
    
    return svg;
}

/**
 * Generate full HTML page
 */
function generateHTML(dataPoints) {
    var svg = generateSVG(dataPoints);
    
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
        summaryHtml += '            <tr style="background: #f5f5f5;">\n';
        summaryHtml += '                <td style="padding: 10px; border: 1px solid #ddd;"><strong>Current Asset Value</strong></td>\n';
        summaryHtml += '                <td style="padding: 10px; border: 1px solid #ddd;">' + formatValue(latest.assetValue) + '</td>\n';
        summaryHtml += '            </tr>\n';
        summaryHtml += '            <tr>\n';
        summaryHtml += '                <td style="padding: 10px; border: 1px solid #ddd;"><strong>Total Net Worth</strong></td>\n';
        summaryHtml += '                <td style="padding: 10px; border: 1px solid #ddd;"><strong>' + formatValue(latest.totalNetWorth) + '</strong></td>\n';
        summaryHtml += '            </tr>\n';
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
    html += '        <p class="generated">Generated on ' + dateStr + ' by networth_graph.js</p>\n';
    html += '    </div>\n';
    html += '</body>\n';
    html += '</html>';
    
    return html;
}

/**
 * Main function
 */
function main(args) {
    print("=== Net Worth Graph Generator ===", "blue");
    print("Building graph data from profit tracking files...", "blue");
    
    var dataPoints = buildGraphData();
    
    if (!dataPoints || dataPoints.length === 0) {
        print("No data found to generate graph.", "red");
        print("Make sure you have been using ptrack to log breakpoints.", "red");
        return;
    }
    
    var html = generateHTML(dataPoints);
    
    // Print summary
    print("Graph data processed successfully!", "green");
    print("Data points: " + dataPoints.length, "blue");
    
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
        
        print("Latest data: " + latest.date, "blue");
        print("  Liquid Meat: " + formatValue(latest.liquidMeat), "teal");
        print("  Asset Value: " + formatValue(latest.assetValue), "teal");
        print("  Total Net Worth: " + formatValue(latest.totalNetWorth), "teal");
        print("  Liquid Meat Earn/Loss: " + (meatChange >= 0 ? "+" : "") + formatValue(meatChange), "teal");
        print("  Total Meat Earned: +" + formatValue(totalGains), "green");
        print("  Total Meat Spent: -" + formatValue(totalLosses), "red");
    }
    
    // Save HTML to file
    var outputPath = "networth_graph_" + myName() + ".html";
    try {
        var success = bufferToFile(html, outputPath);
        if (success) {
            print("", "blue");
            print("Graph saved to: data/" + outputPath, "green");
            print("Open this file in your browser to view the graph!", "blue");
        } else {
            print("Could not save file, displaying in relay browser instead.", "orange");
            printHtml(html);
        }
    } catch (e) {
        print("Error saving file: " + e, "orange");
        print("Displaying in relay browser instead.", "blue");
        printHtml(html);
    }
}

module.exports.main = main;
