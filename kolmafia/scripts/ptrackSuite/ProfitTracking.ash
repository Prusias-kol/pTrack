script ProfitTracking;
notify the dictator;
import DicsLibrary;

// To use, import the script and call ProfitLog whenever you want to create a logging point and ProfitCompare (or ProfitCompareAll) when you want the results between two.

string Yesterdate() {
	return timestamp_to_date(date_to_timestamp("yyyyMMdd",today_to_string())-1000*60*60*24,"yyyyMMdd");
}

void LogItems(string event, boolean destruct) {
	int [item] itemList;
	file_to_map("/Profit Tracking/"+my_name()+"/inventory/"+today_to_string()+" "+event+".txt",itemList);
	if ( !destruct && count(itemList) > 0 )
		print("Profit: Not logging items again for event: "+event,"orange");
	else {
		cli_execute("refresh shop");
		cli_execute("refresh storage");
		if ( can_interact() && get_property_int("lastEmptiedStorage")<0 )
			cli_execute("pull all");
		cli_execute("refresh inv");
		print("Profit: Logging Items...","fuchsia");
		foreach it in $items[]
			if ( total_amount(it) != 0 )
				itemList[it] = total_amount(it);
		print("Profit: "+count(itemList)+" items logged to "+today_to_string()+" "+event+".","fuchsia");
		map_to_file(itemList,"/Profit Tracking/"+my_name()+"/inventory/"+today_to_string()+" "+event+".txt");
	}
}

boolean ProfitLogExists(string date,string event) {
	record logevent { int adv; int meat; string activity; };
	logevent [string, string] meatlist;
	file_to_map("/Profit Tracking/"+my_name()+"/meat.txt",meatlist);
	if ( meatlist[date] contains event )
		return true;
	else
		return false;
}

void LogMeat(string event, boolean destruct) {
	record logevent { int adv; int meat; string activity; string time; };
	logevent [string, string] meatlist;
	file_to_map("/Profit Tracking/"+my_name()+"/meat.txt",meatlist);
	if ( !destruct && ProfitLogExists(today_to_string(),event) )
		print("Profit: Not logging meat again for event: "+event,"orange");
	else {
		logevent newest;
		newest.meat = my_meat()+my_storage_meat()+my_closet_meat();
		newest.adv = total_turns_played();
		if ( get_property_bool("_Dic.Barfday") )
			newest.activity = "Barf";
		else if ( !can_interact() )
			newest.activity = "Ascending: "+my_path();
		else
			newest.activity = "???";
		newest.time = now_to_int();
		meatlist[today_to_string(),event] = newest;
		boolean dummy = map_to_file(meatlist,"/Profit Tracking/"+my_name()+"/meat.txt");
			if ( !dummy )
				abort("Profit: Aaah, we didn't write the file somehow");
		print("Profit: Logging meat for event "+event,"fuchsia");
	}
}

void LogNetworthCheckpoint(string event) {
	// If slow, modify to only log on start events
	// if ( event != "start" )
	// 	return;
	
	
	record networthevent { int meat; int calculateditemvalue; };
	networthevent [string, string] networthlist;
	file_to_map("/Profit Tracking/"+my_name()+"/networth_checkpoints.txt", networthlist);
	
	networthevent newest;
	newest.meat = my_meat() + my_storage_meat() + my_closet_meat();
	
	// Calculate total item value using current prices
	int totalItemValue = 0;
	foreach it in $items[]
		if ( total_amount(it) != 0 )
			totalItemValue += total_amount(it) * itemValue(it);
	
	newest.calculateditemvalue = totalItemValue;
	networthlist[today_to_string(), event] = newest;
	
	boolean dummy = map_to_file(networthlist, "/Profit Tracking/"+my_name()+"/networth_checkpoints.txt");
	if ( !dummy )
		abort("Profit: Failed to write networth checkpoint");
	print("Profit: Logged networth checkpoint (meat: " + newest.meat + ", items: " + newest.calculateditemvalue + ")", "fuchsia");
}

void ProfitLog(string event, boolean destruct) {
	LogMeat(event,destruct);
	LogItems(event,destruct);
	LogNetworthCheckpoint(event);
	if ( !ProfitLogExists(today_to_string(),event) )
		abort("Couldn't find the profit log we just tried to make: "+event);
}

int ProfitCompareItem( boolean silent, string date1, string event1, string date2, string event2 ) {
	int [item] itemList1, itemList2;
	file_to_map("/Profit Tracking/"+my_name()+"/inventory/"+date1+" "+event1+".txt",itemList1);
	file_to_map("/Profit Tracking/"+my_name()+"/inventory/"+date2+" "+event2+".txt",itemList2);

	record itemcount { item it; int amount; };
	itemcount [int] diff;
	int difference;
	int profit;

	boolean[item] blacklistedItems;

	foreach x, it in get_property("prusias_profitTracking_blacklist").split_string('(?<!\\\\)(, |,)') {
		it = replace_all(create_matcher(`\\\\`, it), "");
		blacklistedItems[it.to_item()] = true;
	}

	foreach it in $items[] {
		if ( itemList1[it] != itemList2[it] ) {
			if(blacklistedItems contains it){
				continue;
			}

			difference = itemList2[it]-itemList1[it];
			diff[diff.count()] = new itemcount(it, difference);
			profit += difference*itemValue(it);
		}
	}
	if ( !silent ) {
		sort diff by value.amount*itemValue(value.it);
		print_html("<b>Top 10s (includes items disappearing from mall store):</b>");
		for i from 0 to 10
			if ( diff[i].amount < 0 )
				print(diff[i].amount+" "+diff[i].it+" : "+to_string(diff[i].amount*itemValue(diff[i].it),"%,d"));
		print("---------------------------------");
		for i from count(diff)-1 to count(diff)-21
			if ( diff[i].amount > 0 )
				print(diff[i].amount+" "+diff[i].it+" : "+to_string(diff[i].amount*itemValue(diff[i].it),"%,d"));
	}
	print_html("<b>Summary:</b>");
	print("You've earned "+to_string(profit,"%,d")+" in item differences","teal");
	return profit;
}

int ProfitCompare( boolean silent, string date1, string event1, string date2, string event2 ) {
	if ( ProfitLogExists(date1,event1) && ProfitLogExists(date2,event2) ) {
		record differs { int total; int adv; int meat; int it; int time; };
		differs [ string, string, string, string ] ProfitList;
		file_to_map("/Profit Tracking/"+my_name()+"/ProfitList.txt",ProfitList);

		differs diff;
		diff.it = ProfitCompareItem(silent,date1,event1,date2,event2);
		record logevent { int adv; int meat; string activity; int time; };
		logevent [string, string] meatlist;
		file_to_map("/Profit Tracking/"+my_name()+"/meat.txt",meatlist);
		diff.meat = meatlist[date2,event2].meat-meatlist[date1,event1].meat;
		diff.adv  = meatlist[date2,event2].adv-meatlist[date1,event1].adv;
		if ( meatlist[date2,event2].time > 0 && meatlist[date1,event1].time > 0 )
			diff.time = meatlist[date2,event2].time-meatlist[date1,event1].time;
		diff.total = diff.it + diff.meat;
		ProfitList[date1,event1,date2,event2] = diff;

		map_to_file(ProfitList,"/Profit Tracking/"+my_name()+"/ProfitList.txt");
		print_html("<font color=cc5500>You've earned "+to_string(diff.meat,"%,d")+" liquid meat</font>");
		print_html("You've spent "+diff.adv+" adventures"+(diff.adv > 4 ? " for a total (meat+item) <b>"+(diff.total/diff.adv)+" mpa</b>" : ""));
		if ( diff.time > 0 )
			print("From "+timestamp_to_date(meatlist[date1,event1].time,"HH:mm:ss")+" "+event1+" to "+timestamp_to_date(meatlist[date2,event2].time,"HH:mm:ss")+" "+event2+" took "+to_string(diff.time/1000/60/60,"%0,2d")+":"+to_string(diff.time/1000/60%60,"%0,2d")+":"+to_string(diff.time/1000%60,"%0,2d")+".");
		print("You've earned a total of "+to_string(diff.total,"%,d")+" meat between "+date1+" "+event1+" and "+date2+" "+event2+".","teal");
		print("");
		return diff.total;
	}
	else {
		print("No profit log found for "+date1+" "+event1+" or "+date2+" "+event2+".","red");
		return 1;
	}
}

int ProfitCompare( boolean silent, string event1, string event2 ) {
	return ProfitCompare( silent, today_to_string(), event1, today_to_string(), event2 );
}

void ProfitCheckEvents() {
	boolean [string] events = $strings[Start,End,BeforeFF,AfterFF,AfterElectrofishing,BeforeFinal50,AfterFinal50,BeforeEmbezzlers,AfterEmbezzlers,BeforeSandworms,AfterSandworms,BeforeCrimbo,BeforeBarfDaySetup,AfterBarfDaySetup];
	record logevent { int adv; int meat; string activity; };
	logevent [string, string] meatlist;
	file_to_map("/Profit Tracking/"+my_name()+"/meat.txt",meatlist);

	foreach s in meatlist[today_to_string()]
		if ( !(events contains s) )
			print("Profits: Don't recognize event "+s);
}

void ProfitCompareAll(string date) {
	ProfitCompare(true,date,"BeforeFF",date,"AfterFF");
	ProfitCompare(true,date,"BeforeFF",date,"AfterElectrofishing");
	ProfitCompare(true,date,"BeforeBarfDaySetup",date,"AfterBarfDaySetup");
	ProfitCompare(true,date,"BeforeEmbezzlers",date,"AfterEmbezzlers");
	ProfitCompare(true,date,"BeforeSandworms",date,"AfterSandworms");
	ProfitCompare(true,date,"BeforeFinal50",date,"AfterFinal50");
	ProfitCompare(true,date,"BeforeBarfDaySetup",date,"AfterFinal50");
	ProfitCompare(false,date,"Start",date,"End");
	ProfitCheckEvents();
}

void ProfitCompareAll() {
	ProfitCompare(true,Yesterdate(),"End",today_to_string(),"Start");
	ProfitCompareAll(today_to_string());
}
