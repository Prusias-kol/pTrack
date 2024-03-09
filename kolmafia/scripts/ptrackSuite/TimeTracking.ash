script TimeTracking;
import <ProfitTracking.ash>

/* https://pastebin.com/EyMQWtbp for profit_tracking from The Dictator*/

/* Time Tracking EZ mode */
string generate_filename(string event, string date){
	return "/TimeTracking/"+my_name()+"/"+date+" "+event+".txt";
}

string generate_filename(string event){
	return generate_filename(event, today_to_string());
}

void log_time(string event, boolean destruct) {
	string temp = file_to_buffer(generate_filename(event));
	string time = to_string(gametime_to_int());
	buffer time_b;
	time_b.append(time);
	if ( !destruct && length(temp) > 0 ) {
		print("Profit: Not logging items again for event: "+event,"orange");
	} else {
		buffer_to_file(time_b,"/TimeTracking/"+my_name()+"/"+today_to_string()+" "+event+".txt");
	}
}

void log_time(string event) {
	log_time(event, false);
}

int time_compare(string date1, string event1, string date2, string event2) {
	int time1 = to_int(to_string(file_to_buffer(generate_filename(event1, date1))));
	int time2 = to_int(to_string(file_to_buffer(generate_filename(event2, date2))));
	int diff = time2-time1;
	print("The difference is " + diff/1000 +" seconds or " + diff/60/1000 +" min or " + diff/60/60/1000 + " hours");
	return diff;
}

int time_compare(string event1, string event2) {
	return time_compare(today_to_string(), event1, today_to_string(), event2);
}

/* Combine with Profit Tracking */
void log_both(string event, boolean destruct) {
	log_time(event, destruct);
	ProfitLog(event, destruct);
}
void log_both(string event) {
	log_both(event, false);
}

void compare_both(string date1, string event1, string date2, string event2, boolean quiet) {
	print("**********************************");
	time_compare(date1, event1, date2, event2);
	print("**********************************");
	ProfitCompare(quiet, date1, event1, date2, event2);
	print("**********************************");
}

void compare_both(string date1, string event1, string date2, string event2) {
	compare_both(date1, event1, date2, event2, true);
}

void compare_both(string event1, string event2) {
	string date = today_to_string();
	compare_both(date, event1, date, event2, true);
}
void compare_both(string event1, string event2, boolean quiet) {
	string date = today_to_string();
	compare_both(date, event1, date, event2, quiet);
}

/* We want to be able to do CompareEvents like The Dictator, but I want to dynamically create the list of events
because I change things reasonably often.
Mafia of course doesn't make this easy because I can't just look at all files in the appropriate data folder.
We therefore need to have a global variable that holds the day's events. */

void add_event_to_list(string event) {
	// We don't want this cleared on ascension
	string prev_prop = get_property("thoth19_event_list");
	string new_prop;
	if (prev_prop == "") {
		new_prop = event;
	} else {
		new_prop = prev_prop +","+event;
	}
	set_property("thoth19_event_list", new_prop);
}
void clear_event_list() {
	set_property("thoth19_event_list", "");
}
void log_both_and_add(string event) {
	log_both(event);
	add_event_to_list(event);
}
void compare_using_list() {
	string[int] split_map = split_string(get_property("thoth19_event_list"), ",");
	string event1 = split_map[0];
	string event2;
	int last = count(split_map) -1;
	if (last < 1) {
		print("Not enough breakpoints in list");
		return;
	}
	for it from 1 to last {
	   event2 = split_map[it];
	   print("Now comparing " + event1 + " and " + event2);
	   compare_both(event1, event2);
	   event1 = event2;
	}
}
