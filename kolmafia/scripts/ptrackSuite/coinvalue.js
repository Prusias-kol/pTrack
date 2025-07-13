const { isCoinmasterItem, isAccessible, printHtml, sellsItem, mallPrice, sellPrice } = require("kolmafia");
Item.all().forEach((i) => { if (isCoinmasterItem(i)) { mallPrice(i) }});

function addCommas(nStr) {
    nStr += '';
    var x = nStr.split('.');
    var x1 = x[0];
    var rgx = /(\d+)(\d{3})/;
    while (rgx.test(x1)) {
            x1 = x1.replace(rgx, '$1' + ',' + '$2');
    }
    return x1;
}

groupedMap = new Map();
for (let cm of Coinmaster.all().filter((x) => x !== Coinmaster.get("none") && x.availableTokens && isAccessible(x))) {
    if (groupedMap.has(cm.token)) {
        groupedMap.get(cm.token).push(cm)
    }
    else {
        groupedMap.set(cm.token, [cm])
    }
}
var total = 0;
for (let [key, value] of groupedMap.entries()) {
    printHtml("<font color=eda800>" + key + "</font>");
	var coinSum = 0;
    for (let cm of value) {
        let availableItems = Item.all().filter((i) => sellsItem(cm, i)).map((i) => { return { it: i, value: 0.9* mallPrice(i) / sellPrice(cm, i)}});
        availableItems.sort((a, b) => b.value - a.value);
        let best = availableItems[0];
        if (best) {
            printHtml("For coinmaster <b>" + cm + "</b> you have " + cm.availableTokens + " " + cm.token + " and the best way to spend them is on " + best.it + " with a value of " + addCommas(best.value) + " meat per token.");
			coinSum = Math.max(cm.availableTokens * best.value, coinSum);
        }
    }
	total += coinSum;
	printHtml("<b>Max Coin Value = " + addCommas(coinSum) + "</b>");
}
printHtml("<font color=eda800><b>Total Potential Value = " + addCommas(total) + "</b></font>");
