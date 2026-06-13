var kolmafia = require("kolmafia");

var autosellPrice = kolmafia.autosellPrice;
var fileToBuffer = kolmafia.fileToBuffer;
var formFields = kolmafia.formFields;
var getProperty = kolmafia.getProperty;
var historicalPrice = kolmafia.historicalPrice;
var myName = kolmafia.myName;
var toItem = kolmafia.toItem;
var write = kolmafia.write;

function dataPath(filename) {
    return "Profit Tracking/" + myName() + "/" + filename;
}

function readText(filename) {
    try {
        return String(fileToBuffer(filename) || "");
    } catch (e) {
        return "";
    }
}

function parseLines(filename, minimumColumns) {
    var content = readText(filename);
    var result = [];
    if (!content) return result;

    var lines = content.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        var parts = lines[i].split("\t");
        if (parts.length >= minimumColumns) result.push(parts);
    }
    return result;
}

function checkpointId(date, event) {
    return date + "\t" + event;
}

function readCheckpoints() {
    var rows = parseLines(dataPath("meat.txt"), 4);
    var checkpoints = [];
    for (var i = 0; i < rows.length; i++) {
        if (!/^\d{8}$/.test(rows[i][0])) continue;
        checkpoints.push({
            id: checkpointId(rows[i][0], rows[i][1]),
            date: rows[i][0],
            event: rows[i][1],
            adventures: parseInt(rows[i][2], 10) || 0,
            meat: parseInt(rows[i][3], 10) || 0,
            activity: rows[i][4] || "",
            time: parseInt(rows[i][5], 10) || 0
        });
    }
    checkpoints.sort(function (a, b) {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
        if (a.time && b.time && a.time !== b.time) return a.time - b.time;
        if (a.adventures !== b.adventures) return a.adventures - b.adventures;
        return a.event < b.event ? -1 : a.event > b.event ? 1 : 0;
    });
    return checkpoints;
}

function readNetworth() {
    var rows = parseLines(dataPath("networth_checkpoints.txt"), 4);
    var result = {};
    for (var i = 0; i < rows.length; i++) {
        var meat = parseInt(rows[i][2], 10) || 0;
        var items = parseInt(rows[i][3], 10) || 0;
        result[checkpointId(rows[i][0], rows[i][1])] = {
            meat: meat,
            items: items,
            total: meat + items
        };
    }
    return result;
}

function readAccountval() {
    var rows = parseLines(dataPath("accountval_checkpoints.txt"), 10);
    var result = {};
    for (var i = 0; i < rows.length; i++) {
        result[checkpointId(rows[i][0], rows[i][1])] = {
            worth: parseInt(rows[i][2], 10) || 0,
            mra: parseFloat(rows[i][3]) || 0,
            liquid: parseInt(rows[i][4], 10) || 0,
            extinct: parseInt(rows[i][5], 10) || 0,
            unboundWorth: parseInt(rows[i][6], 10) || 0,
            unboundMra: parseFloat(rows[i][7]) || 0
        };
    }
    return result;
}

function readProfitComparisons() {
    var rows = parseLines(dataPath("ProfitList.txt"), 9);
    var result = {};
    for (var i = 0; i < rows.length; i++) {
        result[checkpointId(rows[i][0], rows[i][1]) + "\n" + checkpointId(rows[i][2], rows[i][3])] = {
            total: parseInt(rows[i][4], 10) || 0,
            adventures: parseInt(rows[i][5], 10) || 0,
            meat: parseInt(rows[i][6], 10) || 0,
            items: parseInt(rows[i][7], 10) || 0,
            time: parseInt(rows[i][8], 10) || 0
        };
    }
    return result;
}

function readInventory(checkpoint) {
    var filename = dataPath("inventory/" + checkpoint.date + " " + checkpoint.event + ".txt");
    var content = readText(filename);
    var result = { found: content.length > 0, items: {} };
    if (!content) return result;

    var lines = content.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        var parts = lines[i].split("\t");
        if (parts.length < 2) continue;
        var key = parts[0].trim();
        var match = /^\[(\d+)\](.*)$/.exec(key);
        var id = match ? match[1] : key;
        var name = match && match[2] ? match[2] : key;
        result.items[id] = {
            id: id,
            name: name,
            count: parseInt(parts[1], 10) || 0
        };
    }
    return result;
}

function readPriceOverrides() {
    var result = {};
    var parts = String(getProperty("prusias_ptrack_priceOverrides") || "").split(/\s*,\s*/);
    for (var i = 0; i < parts.length; i++) {
        var match = /^(\d+):(\d+)$/.exec(parts[i]);
        if (match) result[match[1]] = parseInt(match[2], 10) || 0;
    }
    return result;
}

function readBlacklist() {
    var result = {};
    var parts = String(getProperty("prusias_profitTracking_blacklist") || "").split(/,\s*/);
    for (var i = 0; i < parts.length; i++) {
        if (!parts[i]) continue;
        try {
            var item = toItem(parts[i].replace(/\\,/g, ","));
            if (item) result[String(item.id)] = true;
        } catch (e) {
            // Ignore stale or invalid blacklist entries.
        }
    }
    return result;
}

function cachedItemValue(id, overrides) {
    if (overrides[id] !== undefined) return overrides[id];
    try {
        var item = toItem(parseInt(id, 10));
        if (!item) return 0;
        var price = historicalPrice(item) || 0;
        var autosell = autosellPrice(item) || 0;
        return Math.max(Math.floor(price * 0.9), autosell);
    } catch (e) {
        return 0;
    }
}

function compareInventories(first, second) {
    var firstInventory = readInventory(first);
    var secondInventory = readInventory(second);
    var overrides = readPriceOverrides();
    var blacklist = readBlacklist();
    var ids = {};
    var changes = [];
    var estimatedItemDelta = 0;

    Object.keys(firstInventory.items).forEach(function (id) { ids[id] = true; });
    Object.keys(secondInventory.items).forEach(function (id) { ids[id] = true; });

    Object.keys(ids).forEach(function (id) {
        if (blacklist[id]) return;
        var before = firstInventory.items[id] ? firstInventory.items[id].count : 0;
        var after = secondInventory.items[id] ? secondInventory.items[id].count : 0;
        var difference = after - before;
        if (!difference) return;

        var price = cachedItemValue(id, overrides);
        var impact = difference * price;
        var entry = secondInventory.items[id] || firstInventory.items[id];
        changes.push({
            id: id,
            name: entry.name,
            before: before,
            after: after,
            difference: difference,
            price: price,
            impact: impact
        });
        estimatedItemDelta += impact;
    });

    changes.sort(function (a, b) {
        return Math.abs(b.impact) - Math.abs(a.impact);
    });

    return {
        firstFound: firstInventory.found,
        secondFound: secondInventory.found,
        changes: changes,
        estimatedItemDelta: estimatedItemDelta
    };
}

function findComparison(comparisons, first, second) {
    var direct = comparisons[first.id + "\n" + second.id];
    if (direct) return direct;
    var reverse = comparisons[second.id + "\n" + first.id];
    if (!reverse) return null;
    return {
        total: -reverse.total,
        adventures: -reverse.adventures,
        meat: -reverse.meat,
        items: -reverse.items,
        time: -reverse.time
    };
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function safeJson(value) {
    return JSON.stringify(value)
        .replace(/</g, "\\u003c")
        .replace(/>/g, "\\u003e")
        .replace(/&/g, "\\u0026")
        .replace(/\u2028/g, "\\u2028")
        .replace(/\u2029/g, "\\u2029");
}

function formatNumber(value) {
    var number = Number(value) || 0;
    var sign = number < 0 ? "-" : "";
    var digits = String(Math.abs(Math.round(number)));
    return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatSigned(value) {
    return (value > 0 ? "+" : "") + formatNumber(value);
}

function formatDate(date) {
    return date.substring(0, 4) + "-" + date.substring(4, 6) + "-" + date.substring(6, 8);
}

function formatTimestamp(timestamp) {
    if (!timestamp) return "Not recorded";
    try {
        return new Date(timestamp).toLocaleString();
    } catch (e) {
        return "Not recorded";
    }
}

function formatDuration(milliseconds) {
    if (!milliseconds) return "Not recorded";
    var negative = milliseconds < 0;
    var seconds = Math.floor(Math.abs(milliseconds) / 1000);
    var hours = Math.floor(seconds / 3600);
    var minutes = Math.floor((seconds % 3600) / 60);
    var remaining = seconds % 60;
    return (negative ? "-" : "") + hours + "h " + minutes + "m " + remaining + "s";
}

function checkpointLabel(checkpoint) {
    return formatDate(checkpoint.date) + " - " + checkpoint.event;
}

function formatActivity(activity) {
    if (!activity || activity === "???") return "Aftercore / unspecified";
    return activity;
}

function optionsHtml(checkpoints, selectedId) {
    var html = "";
    var currentDate = "";
    for (var i = checkpoints.length - 1; i >= 0; i--) {
        var checkpoint = checkpoints[i];
        if (checkpoint.date !== currentDate) {
            if (currentDate) html += "</optgroup>";
            currentDate = checkpoint.date;
            html += '<optgroup label="' + escapeHtml(formatDate(currentDate)) + '" data-date="' + escapeHtml(currentDate) + '">';
        }
        html += '<option value="' + escapeHtml(checkpoint.id) + '" data-date="' + escapeHtml(checkpoint.date) + '"' +
            (checkpoint.id === selectedId ? " selected" : "") + ">" +
            escapeHtml(checkpoint.event) + " (" + formatNumber(checkpoint.meat) + " liquid Meat)</option>";
    }
    if (currentDate) html += "</optgroup>";
    return html;
}

function dateFiltersHtml(target, fields) {
    var prefix = "filter_" + target + "_";
    return '<div class="date-filters" data-filter-target="' + target + '" data-year="' +
        escapeHtml(fields[prefix + "year"] || "") + '" data-month="' +
        escapeHtml(fields[prefix + "month"] || "") + '" data-day="' +
        escapeHtml(fields[prefix + "day"] || "") + '">' +
        '<input type="hidden" name="' + prefix + 'year" class="filter-year-value" value="' + escapeHtml(fields[prefix + "year"] || "") + '">' +
        '<input type="hidden" name="' + prefix + 'month" class="filter-month-value" value="' + escapeHtml(fields[prefix + "month"] || "") + '">' +
        '<input type="hidden" name="' + prefix + 'day" class="filter-day-value" value="' + escapeHtml(fields[prefix + "day"] || "") + '">' +
        '<label>Year<select class="filter-year"><option value="">Any</option></select></label>' +
        '<label>Month<select class="filter-month"><option value="">Any</option></select></label>' +
        '<label>Day<select class="filter-day"><option value="">Any</option></select></label>' +
        '<button type="button" class="clear-filter">Clear</button>' +
        '<span class="filter-count"></span></div>';
}

function metricCard(label, value, detail, tone) {
    return '<div class="metric ' + (tone || "") + '">' +
        '<div class="metric-label">' + escapeHtml(label) + "</div>" +
        '<div class="metric-value">' + escapeHtml(value) + "</div>" +
        '<div class="metric-detail">' + escapeHtml(detail || "") + "</div>" +
        "</div>";
}

function comparisonTable(first, second, networth, accountval) {
    var firstNetworth = networth[first.id];
    var secondNetworth = networth[second.id];
    var firstAccountval = accountval[first.id];
    var secondAccountval = accountval[second.id];

    function cell(value) {
        return "<td>" + escapeHtml(value) + "</td>";
    }

    function row(label, firstValue, secondValue) {
        return "<tr><th>" + escapeHtml(label) + "</th>" + cell(firstValue) + cell(secondValue) + "</tr>";
    }

    var html = '<div class="table-wrap"><table><thead><tr><th>Metric</th><th>' +
        escapeHtml(checkpointLabel(first)) + "</th><th>" + escapeHtml(checkpointLabel(second)) +
        "</th></tr></thead><tbody>";
    html += row("Run context", formatActivity(first.activity), formatActivity(second.activity));
    html += row("Timestamp", formatTimestamp(first.time), formatTimestamp(second.time));
    html += row("Total adventures", formatNumber(first.adventures), formatNumber(second.adventures));
    html += row("Liquid Meat", formatNumber(first.meat), formatNumber(second.meat));
    html += row("Historical item value", firstNetworth ? formatNumber(firstNetworth.items) : "Not recorded",
        secondNetworth ? formatNumber(secondNetworth.items) : "Not recorded");
    html += row("Historical account value", firstNetworth ? formatNumber(firstNetworth.total) : "Not recorded",
        secondNetworth ? formatNumber(secondNetworth.total) : "Not recorded");
    html += row("Accountval worth", firstAccountval && firstAccountval.worth ? formatNumber(firstAccountval.worth) : "Not recorded",
        secondAccountval && secondAccountval.worth ? formatNumber(secondAccountval.worth) : "Not recorded");
    html += row("Accountval unbound worth",
        firstAccountval && firstAccountval.unboundWorth ? formatNumber(firstAccountval.unboundWorth) : "Not recorded",
        secondAccountval && secondAccountval.unboundWorth ? formatNumber(secondAccountval.unboundWorth) : "Not recorded");
    html += "</tbody></table></div>";
    return html;
}

function itemChangesTable(changes) {
    if (!changes.length) return '<p class="empty">No inventory count changes were found.</p>';
    var limit = Math.min(changes.length, 40);
    var html = '<div class="table-wrap"><table class="items"><thead><tr>' +
        "<th>Item</th><th>Before</th><th>After</th><th>Change</th><th>Cached value</th><th>Estimated impact</th>" +
        "</tr></thead><tbody>";
    for (var i = 0; i < limit; i++) {
        var change = changes[i];
        html += "<tr><td>" + escapeHtml(change.name) + "</td>" +
            "<td>" + formatNumber(change.before) + "</td>" +
            "<td>" + formatNumber(change.after) + "</td>" +
            '<td class="' + (change.difference >= 0 ? "positive" : "negative") + '">' + formatSigned(change.difference) + "</td>" +
            "<td>" + formatNumber(change.price) + "</td>" +
            '<td class="' + (change.impact >= 0 ? "positive" : "negative") + '">' + formatSigned(change.impact) + "</td></tr>";
    }
    html += "</tbody></table></div>";
    if (changes.length > limit) {
        html += '<p class="note">Showing the 40 largest estimated impacts out of ' + formatNumber(changes.length) + " changed items.</p>";
    }
    return html;
}

function downsampleRange(checkpoints, first, second, networth) {
    var firstIndex = checkpoints.indexOf(first);
    var secondIndex = checkpoints.indexOf(second);
    var start = Math.min(firstIndex, secondIndex);
    var end = Math.max(firstIndex, secondIndex);
    var step = Math.max(1, Math.ceil((end - start + 1) / 160));
    var result = [];
    for (var i = start; i <= end; i += step) {
        var cp = checkpoints[i];
        var nw = networth[cp.id];
        result.push({
            label: formatDate(cp.date) + " " + cp.event,
            meat: cp.meat,
            total: nw ? nw.total : null
        });
    }
    if (result.length && result[result.length - 1].label !== formatDate(checkpoints[end].date) + " " + checkpoints[end].event) {
        var finalCheckpoint = checkpoints[end];
        var finalNetworth = networth[finalCheckpoint.id];
        result.push({
            label: formatDate(finalCheckpoint.date) + " " + finalCheckpoint.event,
            meat: finalCheckpoint.meat,
            total: finalNetworth ? finalNetworth.total : null
        });
    }
    return result;
}

function renderPage() {
    var checkpoints = readCheckpoints();
    if (checkpoints.length < 2) {
        return '<!doctype html><html><body><h1>pTrack Checkpoint Explorer</h1>' +
            "<p>At least two entries are required in <code>" + escapeHtml(dataPath("meat.txt")) + "</code>.</p></body></html>";
    }

    var checkpointById = {};
    checkpoints.forEach(function (checkpoint) { checkpointById[checkpoint.id] = checkpoint; });
    var fields = formFields();
    var first = checkpointById[fields.first] || checkpoints[checkpoints.length - 2];
    var second = checkpointById[fields.second] || checkpoints[checkpoints.length - 1];
    var networth = readNetworth();
    var accountval = readAccountval();
    var comparisons = readProfitComparisons();
    var inventory = compareInventories(first, second);
    var savedComparison = findComparison(comparisons, first, second);
    var firstNetworth = networth[first.id];
    var secondNetworth = networth[second.id];
    var liquidDelta = second.meat - first.meat;
    var adventureDelta = second.adventures - first.adventures;
    var elapsed = first.time && second.time ? second.time - first.time : savedComparison ? savedComparison.time : 0;
    var itemDelta;
    var itemDeltaSource;

    if (firstNetworth && secondNetworth) {
        itemDelta = secondNetworth.items - firstNetworth.items;
        itemDeltaSource = "historical values saved at each checkpoint";
    } else if (savedComparison) {
        itemDelta = savedComparison.items;
        itemDeltaSource = "saved pTrack comparison";
    } else {
        itemDelta = inventory.estimatedItemDelta;
        itemDeltaSource = "cached current prices";
    }

    var totalDelta = liquidDelta + itemDelta;
    var mpa = adventureDelta ? Math.round(totalDelta / adventureDelta) : 0;
    var chartChanges = inventory.changes.slice(0, 18);
    var chartData = {
        range: downsampleRange(checkpoints, first, second, networth),
        deltas: [
            { label: "Liquid Meat", value: liquidDelta },
            { label: "Items", value: itemDelta },
            { label: "Total", value: totalDelta }
        ],
        items: chartChanges.map(function (change) {
            return { label: change.name, value: change.impact };
        })
    };

    var warning = "";
    if (!inventory.firstFound || !inventory.secondFound) {
        warning = '<div class="warning">One or both inventory snapshot files could not be found. Item changes may be incomplete.</div>';
    }

    var html = '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width, initial-scale=1">' +
        "<title>pTrack Checkpoint Explorer</title><style>" + styles() + "</style></head><body>";
    html += '<main><header><div><div class="eyebrow">pTrack</div><h1>Checkpoint Explorer</h1>' +
        '<p class="subtitle">Compare saved checkpoints, inspect inventory movement, and graph the interval.</p></div></header>';
    html += '<section class="panel selector"><form method="post" action=""><div class="checkpoint-picker">' +
        '<div class="picker-heading">Starting checkpoint</div>' + dateFiltersHtml("first", fields) +
        '<select name="first" class="checkpoint-select">' + optionsHtml(checkpoints, first.id) +
        '</select></div><div class="arrow">to</div><div class="checkpoint-picker">' +
        '<div class="picker-heading">Ending checkpoint</div>' + dateFiltersHtml("second", fields) +
        '<select name="second" class="checkpoint-select">' + optionsHtml(checkpoints, second.id) +
        '</select></div><button type="submit" class="compare-button">Compare checkpoints</button></form></section>';
    html += warning;
    html += '<section class="metrics">' +
        metricCard("Total profit", formatSigned(totalDelta), "Liquid + item value", totalDelta >= 0 ? "good" : "bad") +
        metricCard("Liquid Meat", formatSigned(liquidDelta), "Direct Meat change", liquidDelta >= 0 ? "good" : "bad") +
        metricCard("Item value", formatSigned(itemDelta), itemDeltaSource, itemDelta >= 0 ? "good" : "bad") +
        metricCard("Adventures", formatSigned(adventureDelta), adventureDelta ? formatNumber(mpa) + " Meat / adventure" : "No adventure change", "") +
        metricCard("Elapsed", formatDuration(elapsed), checkpointLabel(first) + " to " + checkpointLabel(second), "") +
        "</section>";
    html += '<section class="panel"><div class="section-heading"><div><h2>Checkpoint details</h2>' +
        "<p>Values recorded by pTrack at each selected checkpoint.</p></div></div>" +
        comparisonTable(first, second, networth, accountval) + "</section>";
    html += '<section class="chart-grid"><div class="panel chart-panel"><h2>Checkpoint timeline</h2>' +
        '<p>Liquid Meat and available historical account value between the selected checkpoints.</p><div id="timeline" class="chart"></div></div>' +
        '<div class="panel chart-panel"><h2>Profit breakdown</h2><p>Change between the selected checkpoints.</p>' +
        '<div id="deltas" class="chart"></div></div></section>';
    html += '<section class="panel chart-panel"><h2>Largest item movements</h2>' +
        '<p>Ranked using cached historical prices and pTrack price overrides. No live mall searches are made.</p>' +
        '<div id="items" class="chart tall"></div></section>';
    html += '<section class="panel"><div class="section-heading"><div><h2>Changed items</h2>' +
        "<p>Inventory counts and cached-value estimates. Blacklisted pTrack items are omitted.</p></div>" +
        '<div class="pill">' + formatNumber(inventory.changes.length) + " changed items</div></div>" +
        itemChangesTable(inventory.changes) + "</section>";
    html += '<footer>pTrack data for ' + escapeHtml(myName()) + ". Item rankings use cached values; the summary uses " +
        escapeHtml(itemDeltaSource) + ".</footer></main>";
    html += "<script>window.ptrackCharts=" + safeJson(chartData) + ";</script><script>" + chartScript() + "</script>";
    html += "</body></html>";
    return html;
}

function styles() {
    return [
        ":root{color-scheme:light;--ink:#202020;--muted:#5f6469;--line:#aeb7bf;--panel:#fff;--bg:#dfe3e6;--brand:#315d8c;--good:#22683c;--bad:#9b302b;}",
        "*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:Tahoma,Verdana,Arial,sans-serif;font-size:13px}",
        "main{max-width:1260px;margin:0 auto;padding:18px}header{background:#fff;border:1px solid #8997a3;border-top:4px solid var(--brand);padding:12px 15px;margin-bottom:12px}",
        "h1{font-size:21px;line-height:1.2;margin:1px 0 3px;font-weight:700}h2{font-size:15px;margin:0 0 3px}.subtitle,.panel p{color:var(--muted);margin:0;font-size:12px}.eyebrow{color:#555;font-weight:700;font-size:11px}",
        ".pill{background:#eef1f3;color:#333;border:1px solid #aeb7bf;border-radius:2px;padding:4px 7px;font-weight:400;font-size:11px;white-space:nowrap}",
        ".panel{background:var(--panel);border:1px solid var(--line);border-radius:2px;padding:13px;margin-bottom:12px}.selector{background:#eef2f5;border-color:#8997a3}",
        ".selector form{display:grid;grid-template-columns:minmax(300px,1fr) auto minmax(300px,1fr);gap:12px;align-items:end}.checkpoint-picker{display:grid;gap:6px;min-width:0}.picker-heading{font-weight:700;color:#222}.checkpoint-select{width:100%}.date-filters{display:grid;grid-template-columns:repeat(3,minmax(68px,1fr)) auto;gap:5px;align-items:end}.date-filters label{display:grid;gap:2px;color:#444;font-size:11px;font-weight:400}.date-filters select{min-height:27px;padding:3px 5px}.date-filters .clear-filter{min-height:27px;padding:3px 9px;background:#ececec;color:#222;border-color:#89939c}.filter-count{grid-column:1/-1;color:var(--muted);font-size:10px;min-height:12px}.compare-button{grid-column:1/-1;justify-self:end}.arrow{padding-bottom:11px;color:var(--muted);font-weight:700}",
        "select,button{font:inherit;border-radius:2px;border:1px solid #89939c;min-height:32px;padding:5px 7px;background:#fff;color:var(--ink)}button{background:#e7e7e7;border-color:#7d8891;color:#111;font-weight:400;cursor:pointer;padding:5px 14px}button:hover{background:#f3f3f3}.compare-button{background:var(--brand);border-color:#24486d;color:#fff;font-weight:700}.compare-button:hover{background:#244f7a}",
        ".metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:1px;background:var(--line);border:1px solid var(--line);margin-bottom:12px}.metric{background:#fff;padding:10px 12px;min-width:0}.metric.good .metric-value{color:var(--good)}.metric.bad .metric-value{color:var(--bad)}",
        ".metric-label{font-size:11px;color:#4c5359;font-weight:700}.metric-value{font-size:18px;font-weight:700;margin:5px 0 2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums}.metric-detail{font-size:10px;color:var(--muted);min-height:24px}",
        ".section-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:10px}.table-wrap{overflow:auto;border:1px solid var(--line)}table{width:100%;border-collapse:collapse;min-width:680px;font-variant-numeric:tabular-nums}th,td{text-align:right;padding:7px 9px;border-bottom:1px solid #ccd2d7;white-space:nowrap}th:first-child,td:first-child{text-align:left}thead th{background:#e8edf1;color:#333;font-size:11px;font-weight:700}tbody tr:last-child th,tbody tr:last-child td{border-bottom:0}tbody tr:nth-child(even){background:#f6f7f8}tbody tr:hover{background:#eaf1f8}.items td:first-child{max-width:360px;overflow:hidden;text-overflow:ellipsis}.positive{color:var(--good);font-weight:700}.negative{color:var(--bad);font-weight:700}",
        ".chart-grid{display:grid;grid-template-columns:1.45fr 1fr;gap:12px}.chart-panel{min-width:0;overflow:hidden}.chart{height:300px;margin-top:10px;min-width:0;overflow:hidden;border:1px solid #d3d8dc;background:#fafafa}.chart.tall{height:430px}.chart svg{display:block;width:100%;height:100%;overflow:hidden}.chart .grid{stroke:#d8dde1;stroke-width:1}.chart .axis-label{fill:#555;font-size:11px}.chart .legend{font-size:11px;font-weight:700}.chart .series-toggle{cursor:pointer}.chart .series-toggle:focus{outline:none}.chart .series-toggle:focus .toggle-box{stroke-width:2}.chart .plot-hit{cursor:crosshair}.chart .chart-tooltip{pointer-events:none}.chart .tooltip-title{font-size:11px;font-weight:700}.chart .tooltip-text{font-size:10px;fill:#333}.chart .tooltip-value{font-size:11px;font-weight:700;fill:#111}",
        ".warning{background:#fff4cf;border:1px solid #c8a449;color:#5d4600;padding:9px 11px;margin-bottom:12px}.empty,.note{color:var(--muted);margin:10px 0 0!important}.note{font-size:11px}footer{text-align:center;color:var(--muted);font-size:10px;padding:5px 0 18px}",
        "@media(max-width:1050px){.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.metric:last-child{grid-column:span 2}.chart-grid{grid-template-columns:1fr}.selector form{grid-template-columns:1fr 1fr}.arrow{display:none}.compare-button{grid-column:1/-1}}",
        "@media(max-width:700px){main{padding:8px}.metrics{grid-template-columns:1fr 1fr}.selector form{grid-template-columns:1fr}.compare-button{grid-column:auto;justify-self:stretch}.date-filters{grid-template-columns:repeat(3,1fr)}.date-filters .clear-filter{grid-column:1/-1}.chart{height:260px}}"
    ].join("");
}

function chartScript() {
    return [
        "(function(){",
        "var NS='http://www.w3.org/2000/svg';",
        "function node(name,attrs,text){var n=document.createElementNS(NS,name);Object.keys(attrs||{}).forEach(function(k){n.setAttribute(k,attrs[k]);});if(text!==undefined)n.textContent=text;return n;}",
        "function compact(v){var a=Math.abs(v);if(a>=1e9)return(v/1e9).toFixed(1)+'B';if(a>=1e6)return(v/1e6).toFixed(1)+'M';if(a>=1e3)return(v/1e3).toFixed(1)+'K';return String(Math.round(v));}",
        "function axisCompact(v){var a=Math.abs(v);if(a>=1e9)return(v/1e9).toFixed(4)+'B';if(a>=1e6)return(v/1e6).toFixed(2)+'M';if(a>=1e3)return(v/1e3).toFixed(1)+'K';return String(Math.round(v));}",
        "function fullNumber(v){return Math.round(v).toLocaleString('en-US');}",
        "function base(el){el.innerHTML='';var width=Math.max(el.clientWidth,420),height=Math.max(el.clientHeight,240);var svg=node('svg',{viewBox:'0 0 '+width+' '+height,preserveAspectRatio:'xMidYMid meet'});el.appendChild(svg);return{svg:svg,width:width,height:height};}",
        "function empty(chart,message){chart.svg.appendChild(node('text',{x:chart.width/2,y:chart.height/2,'text-anchor':'middle',class:'axis-label'},message));}",
        "function lineChart(el,points){var state={meat:false,total:true},series=[{key:'meat',label:'Liquid Meat',color:'#315d8c',x:62},{key:'total',label:'Historical account value',color:'#9b7bc4',x:170}];function render(){var chart=base(el),svg=chart.svg,activeTooltip=null;function toggleControl(item){var enabled=state[item.key],group=node('g',{class:'series-toggle',role:'button',tabindex:'0','aria-label':item.label,'aria-pressed':String(enabled),transform:'translate('+item.x+' 9)'});group.appendChild(node('rect',{x:0,y:0,width:12,height:12,rx:1,fill:enabled?item.color:'#fafafa',stroke:item.color,class:'toggle-box'}));if(enabled)group.appendChild(node('path',{d:'M 3 6 L 5 9 L 10 3',fill:'none',stroke:'#fff','stroke-width':1.5}));group.appendChild(node('text',{x:18,y:10,class:'legend',fill:enabled?item.color:'#777'},item.label));function toggle(){state[item.key]=!state[item.key];render();}group.addEventListener('click',toggle);group.addEventListener('keydown',function(event){if(event.key==='Enter'||event.key===' '){event.preventDefault();toggle();}});svg.appendChild(group);}series.forEach(toggleControl);if(points.length<2){empty(chart,'Select checkpoints with an interval to graph.');return;}var left=62,right=18,top=36,bottom=34,w=chart.width-left-right,h=chart.height-top-bottom,values=[];points.forEach(function(p){if(state.meat)values.push(p.meat);if(state.total&&p.total!==null)values.push(p.total);});if(!values.length){empty(chart,'Enable a series with available data.');return;}var min=Math.min.apply(null,values),max=Math.max.apply(null,values);if(min===max){min-=1;max+=1;}for(var i=0;i<5;i++){var y=top+h*i/4;svg.appendChild(node('line',{x1:left,y1:y,x2:left+w,y2:y,class:'grid'}));svg.appendChild(node('text',{x:left-8,y:y+4,'text-anchor':'end',class:'axis-label'},axisCompact(max-(max-min)*i/4)));}function positioned(item){var result=[];points.forEach(function(p,i){if(p[item.key]===null)return;result.push({item:item,point:p,value:p[item.key],x:left+(points.length===1?0:w*i/(points.length-1)),y:top+h-(p[item.key]-min)*h/(max-min)});});return result;}function pathFor(positionedPoints){var d='';positionedPoints.forEach(function(p){d+=(d?' L ':'M ')+p.x+' '+p.y;});return d;}function removeTooltip(){if(activeTooltip){activeTooltip.remove();activeTooltip=null;}}svg.addEventListener('mouseleave',removeTooltip);function showTooltip(item,position){removeTooltip();var width=224,height=51,x=Math.max(4,Math.min(chart.width-width-4,position.x+10)),y=position.y-height-8;if(y<27)y=position.y+10;var label=position.point.label;if(label.length>34)label=label.slice(0,31)+'...';var group=node('g',{class:'chart-tooltip',transform:'translate('+x+' '+y+')'});group.appendChild(node('rect',{x:0,y:0,width:width,height:height,rx:2,fill:'#fff',stroke:'#89939c'}));group.appendChild(node('text',{x:8,y:14,class:'tooltip-title',fill:item.color},item.label));group.appendChild(node('text',{x:8,y:29,class:'tooltip-text'},label));group.appendChild(node('text',{x:8,y:44,class:'tooltip-value'},fullNumber(position.value)));group.appendChild(node('circle',{cx:position.x-x,cy:position.y-y,r:3,fill:'#fff',stroke:item.color,'stroke-width':2}));svg.appendChild(group);activeTooltip=group;}var activePoints=[];series.forEach(function(item){if(!state[item.key])return;var positionedPoints=positioned(item);if(!positionedPoints.length)return;activePoints=activePoints.concat(positionedPoints);svg.appendChild(node('path',{d:pathFor(positionedPoints),fill:'none',stroke:item.color,'stroke-width':2}));});var plotHit=node('rect',{x:left,y:top,width:w,height:h,fill:'transparent','pointer-events':'all',class:'plot-hit','aria-label':'Timeline data points'});plotHit.addEventListener('mousemove',function(event){var rect=svg.getBoundingClientRect(),mouseX=(event.clientX-rect.left)*chart.width/rect.width,mouseY=(event.clientY-rect.top)*chart.height/rect.height,closest=activePoints[0],closestDistance=Infinity;activePoints.forEach(function(position){var dx=position.x-mouseX,dy=position.y-mouseY,distance=dx*dx+dy*dy;if(distance<closestDistance){closest=position;closestDistance=distance;}});if(closest)showTooltip(closest.item,closest);});plotHit.addEventListener('mouseleave',removeTooltip);svg.appendChild(plotHit);svg.appendChild(node('text',{x:left,y:chart.height-6,class:'axis-label'},points[0].label));svg.appendChild(node('text',{x:left+w,y:chart.height-6,'text-anchor':'end',class:'axis-label'},points[points.length-1].label));}render();}",
        "function horizontalBars(el,items,itemMode){var chart=base(el),svg=chart.svg;if(!items.length){empty(chart,itemMode?'No changed items with cached values were found.':'No values to graph.');return;}var labelWidth=itemMode?Math.min(230,chart.width*.28):Math.min(105,chart.width*.22);var valueWidth=itemMode?82:68;var gap=10,top=10,bottom=10;var plotLeft=labelWidth+valueWidth+gap,plotRight=chart.width-valueWidth-gap;var plotWidth=Math.max(80,plotRight-plotLeft),zero=plotLeft+plotWidth/2;var h=chart.height-top-bottom,band=h/items.length,max=1;items.forEach(function(i){max=Math.max(max,Math.abs(i.value));});svg.appendChild(node('line',{x1:zero,y1:top,x2:zero,y2:top+h,stroke:'#89939c','stroke-width':1}));items.forEach(function(item,index){var barHeight=Math.max(Math.min(band*.64,28),3),width=Math.abs(item.value)/max*(plotWidth/2-4);var y=top+index*band+(band-barHeight)/2,x=item.value>=0?zero:zero-width;var label=item.label,maxChars=itemMode?Math.max(12,Math.floor(labelWidth/7)):18;if(label.length>maxChars)label=label.slice(0,maxChars-3)+'...';svg.appendChild(node('text',{x:labelWidth-8,y:y+barHeight*.72,'text-anchor':'end',class:'axis-label'},label));svg.appendChild(node('rect',{x:x,y:y,width:Math.max(width,1),height:barHeight,rx:1,fill:item.value>=0?'#3b7650':'#a94442'}));svg.appendChild(node('text',{x:item.value>=0?plotRight+7:plotLeft-7,y:y+barHeight*.72,'text-anchor':item.value>=0?'start':'end',class:'axis-label'},(item.value>0?'+':'')+compact(item.value)));});}",
        "function bars(el,items){horizontalBars(el,items,false);}",
        "function itemBars(el,items){horizontalBars(el,items,true);}",
        "function populateDateFilter(container){var target=container.getAttribute('data-filter-target'),checkpointSelect=document.querySelector('select[name=\"'+target+'\"]'),year=container.querySelector('.filter-year'),month=container.querySelector('.filter-month'),day=container.querySelector('.filter-day'),yearValue=container.querySelector('.filter-year-value'),monthValue=container.querySelector('.filter-month-value'),dayValue=container.querySelector('.filter-day-value'),count=container.querySelector('.filter-count'),clear=container.querySelector('.clear-filter');var years={},monthNames=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];Array.from(checkpointSelect.options).forEach(function(option){years[option.getAttribute('data-date').slice(0,4)]=true;});Object.keys(years).sort().reverse().forEach(function(value){year.appendChild(new Option(value,value));});for(var m=1;m<=12;m++){var value=String(m).padStart(2,'0');month.appendChild(new Option(monthNames[m-1]+' ('+value+')',value));}for(var d=1;d<=31;d++){var value=String(d).padStart(2,'0');day.appendChild(new Option(value,value));}year.value=container.getAttribute('data-year');month.value=container.getAttribute('data-month');day.value=container.getAttribute('data-day');function apply(){var values=[year.value,month.value,day.value],visible=0,firstVisible=null;yearValue.value=values[0];monthValue.value=values[1];dayValue.value=values[2];Array.from(checkpointSelect.options).forEach(function(option){var date=option.getAttribute('data-date'),show=(!values[0]||date.slice(0,4)===values[0])&&(!values[1]||date.slice(4,6)===values[1])&&(!values[2]||date.slice(6,8)===values[2]);option.hidden=!show;if(show){visible++;if(!firstVisible)firstVisible=option;}});Array.from(checkpointSelect.querySelectorAll('optgroup')).forEach(function(group){group.hidden=!Array.from(group.children).some(function(option){return !option.hidden;});});if(checkpointSelect.selectedOptions.length&&!checkpointSelect.selectedOptions[0].hidden){}else if(firstVisible){firstVisible.selected=true;}count.textContent=visible+' checkpoint'+(visible===1?'':'s')+' shown';}year.addEventListener('change',apply);month.addEventListener('change',apply);day.addEventListener('change',apply);clear.addEventListener('click',function(){year.value='';month.value='';day.value='';apply();});apply();}",
        "Array.from(document.querySelectorAll('.date-filters')).forEach(populateDateFilter);",
        "lineChart(document.getElementById('timeline'),window.ptrackCharts.range);bars(document.getElementById('deltas'),window.ptrackCharts.deltas);itemBars(document.getElementById('items'),window.ptrackCharts.items);",
        "})();"
    ].join("");
}

function main() {
    write(renderPage());
}

module.exports.main = main;
