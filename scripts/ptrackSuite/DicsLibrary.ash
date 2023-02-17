script DicsLibrary;
notify the dictator;
since r20300; // existence of maple magnet

buffer page;
int homeClanId = 84165;	//AfHeck
int minMP = max(0,my_maxmp()*to_float(get_property("mpAutoRecoveryTarget"))) + to_int(get_property("Dic.MinMP"));

float ITEM_PRICE_MULTIPLIER = 0.9;

boolean has_effect( effect ef ) {
	return (have_effect(ef) > 0);
}

boolean bossKilling = (false || (has_effect($effect[steely-eyed squint]) && has_effect($effect[The inquisitor's unknown effect])) );
boolean [slot] BasicSlots = $slots[hat, weapon, off-hand, back, shirt, pants, acc1, acc2, acc3, familiar];

boolean StockUp( int amount, item it, int lowLimit, int highLimit ) {	// To restock generic items from the mall when needed. Creates an 11-fold buffer
	int dummy;
	if ( lowLimit > 1 ) {
		if ( available_amount(it)<amount*11 && shop_price(it)<=lowLimit )					// If we have it stocked below the limit
			take_shop(amount-available_amount(it),it);										// take from the shop first
		if ( available_amount(it)+shop_amount(it)<amount*11 && it.tradeable )					// Don't buy if already stocked
			dummy = buy(max(0,amount*11- available_amount(it)-shop_amount(it)),it,lowLimit);	// Build up (limited) stock at low prices
	}
	if ( shop_amount(it) > 0 )																// it there are any in the shop
		take_shop(amount-available_amount(it),it);												// try taking those
	if ( !retrieve_item(amount,it) && it.tradeable )										// If that still leaves us short
		dummy = buy(amount-item_amount(it),it,highLimit);										// buy minimal at higher price limits
	return ( item_amount(it) >= amount );													// Return if successful or not
}

int get_property_int( string property ) {
	if ( substring(property,0,1) != "_" && !property_exists(property) )
		abort("Couldn't find preference "+property);
	return to_int(get_property(property));
}

boolean get_property_bool( string property ) {
	if ( !property_exists(property) && substring(property,0,1) != "_" )
		abort("Couldn't find preference "+property);
	return to_boolean(get_property(property));
}

location get_property_loc( string property ) {
	if ( !property_exists(property) )
		abort("Couldn't find preference "+property);
	return to_location(get_property(property));
}

void fullHeal() {
	if ( to_float(my_hp())/ my_maxhp() < to_float(get_property("hpAutoRecovery")) && my_maxhp() - my_hp() > 2* my_basestat($stat[muscle]) ) {
		if ( get_campground() contains $item[portable Mayo Clinic] && !get_property_bool("_mayoTankSoaked") )
			cli_execute("mayosoak");
		else if ( get_property_int("_hotTubSoaks") < 5 )
			cli_execute("hottub");
		else
			restore_hp(my_maxhp());
	}
	else
		restore_hp(my_maxhp());
}

static {
	boolean [item] GardenList = $items[Peppermint Pip Packet, packet of dragon's teeth, packet of beer seeds, packet of winter seeds, packet of thanksgarden seeds, packet of tall grass seeds,packet of mushroom spores];
	boolean [item] WorkshedList = $items[warbear jackhammer drill press, warbear auto-anvil, warbear induction oven, warbear chemistry lab, warbear high-efficiency still, warbear lp-rom burner, spinning wheel, snow machine, asdon martin keyfob, portable mayo clinic, little geneticist dna-splicing lab, diabolic pizza cube];
}

int total_amount( item it ) {
	int amount = item_amount(it);
		amount += equipped_amount(it);	// Does not include equips on familiars in terrarium
		amount += closet_amount(it);
		amount += storage_amount(it);
		amount += display_amount(it);
		amount += shop_amount(it);
	foreach f in $familiars[]
		if ( have_familiar(f) && my_familiar() != f && familiar_equipped_equipment(f) == it )
			amount++;
	if ( get_property_bool("autoSatisfyWithStash") )
		amount += stash_amount(it);
	if ( (GardenList contains it || WorkshedList contains it) && get_campground() contains it )
		amount += get_campground()[it];
	return amount;
}

int recent_price(item it) {
	if ( !it.tradeable )								// untradeable items don't have mall value
		return 0;
	else if ( historical_age(it) < 7.0 )				// 1 week sounds about right
		return historical_price(it) * ITEM_PRICE_MULTIPLIER;
	else if (mall_price(it)>0)
		return mall_price(it) * ITEM_PRICE_MULTIPLIER;
	else if (mall_price(it)<0 && my_hash() != "")	{ 	// items that are not in the mall return -1
		if ( is_npc_item(it) )							// Includes items such as lucky lindy, which are marked tradable, but can never be owned
			return 0;
		else if ( historical_age(it) < 4015 )			// historical age returns infinite for items that have never been seen before: 11 years should do it
			return historical_price(it) * ITEM_PRICE_MULTIPLIER;
		else
			return 1000000000;
	}
	else {
		abort("No idea how to price item: "+it);
		return -1;
	}
}

int averageValue ( boolean [item] itemList );

int itemValue ( item it ) {
	int specialValue ( item it ) {
		switch (it) {
			case $item[spooky putty monster]:
				return itemValue($item[spooky putty sheet]);
			case $item[empty Rain-Doh can]:
				return itemValue($item[can of Rain-Doh]);
			case $item[coffee pixie stick]:
				return itemValue($item[Game Grid ticket])*10;
			case $item[roll of hob-os]:
				return 4.5*averageValue($items[sterno-flavored Hob-O, frostbite-flavored Hob-O, fry-oil-flavored Hob-O, strawberry-flavored Hob-O, garbage-juice-flavored Hob-O]);
			case $item[bricko brick]:
				return 90;
			case $item[bricko trunk]:
				return 5*itemValue($item[BRICKO brick])+itemValue($item[BRICKO eye brick])/10;
			case $item[d4]:
				return 2.5*itemValue($item[generic restorative potion]);
			case $item[d6]:
				return 3.5*itemValue($item[generic mana potion]);
			case $item[d8]:
				return 4.5*itemValue($item[generic healing potion]);
			case $item[bag of park garbage]:
				return 200;
			case $item[gathered meat-clip]:
				return 520;
			case $item[unfinished ice sculpture]:
				return 3*itemValue($item[snow berries])+3*itemValue($item[ice harvest]);
			case $item[free-range mushroom]:
				return 3*itemValue($item[mushroom filet]);
			case $item[plump free-range mushroom]:
				return itemValue($item[free-range mushroom])+3*itemValue($item[mushroom filet]);
			case $item[bulky free-range mushroom]:
				return itemValue($item[plump free-range mushroom])+3*itemValue($item[mushroom filet]);
			case $item[giant free-range mushroom]:
				return itemValue($item[bulky free-range mushroom])+itemValue($item[mushroom slab]);
			case $item[immense free-range mushroom]:
				return itemValue($item[giant free-range mushroom])+itemValue($item[mushroom slab]);
			case $item[colossal free-range mushroom]:
				return itemValue($item[immense free-range mushroom])+itemValue($item[house-sized mushroom]);
            case $item[Freddy Kruegerand]:
                //FK items low volume, extra multiplier (sellbot pricing)
                return 0.95* max(itemValue($item[	bottle of Bloodweiser]), itemValue($item[electric Kool-Aid])) / 200;
            //FunFunds
            case $item[8205]:
                return itemValue($item[one-day ticket to Dinseylandfill]) / 20;
            case $item[Beach Buck]:
                return itemValue($item[one-day ticket to Spring Break Beach]) / 100;
            case $item[Volcoino]:
                return itemValue($item[one-day ticket to That 70s Volcano]) / 3;
            case $item[Coinspiracy]:
                return itemValue($item[one-day ticket to Conspiracy Island]) / 100;
            case $item[Wal-Mart gift certificate]:
                return itemValue($item[one-day ticket to The Glaciest]) / 50;
			default:
				if ( npc_price(it) > 0 )
					return npc_price(it);
				return 0;
		}
	}

	int singularValue( item it ) {
		int minValue = specialValue(it);

		if ( recent_price(it) <= max(100,2* autosell_price(it)) )
			return max( minValue , autosell_price(it) );
		else
			return max( minValue , recent_price(it) );
	}

	int maxValue = singularValue(it);
	if ( count(get_related(it,"fold")) > 0 )
		foreach j in get_related(it,"fold")
			maxValue = min( maxValue, singularValue(j) );
	if ( count(get_related(it,"zap")) > 0 )
		foreach j in get_related(it,"zap")
			maxValue = min( maxValue, singularValue(j) );

	return maxValue;
}

int averageValue ( boolean [item] itemList ) {
	int total;
	if ( count(itemList) == 0 )
		return 0;
	foreach it in itemList
		total += itemValue(it);
	return total/count(itemList);
}

int totalValue ( int [item] itemList ) {
	int total;
	foreach it in itemList
		total += itemValue(it)*itemList[it];
	return total;
}

int totalValue ( float [item] itemList ) {
	int total;
	foreach it in itemList
		total += itemValue(it)*itemList[it];
	return total;
}

boolean switchClan(int targetID) {
	if ( to_int(my_id()) > 30 && get_clan_id() != targetID ) {
		visit_url("showclan.php?recruiter=1&whichclan="+ targetID +"&pwd&whichclan=" + targetID + "&action=joinclan&apply=Apply+to+this+Clan&confirm=on");
	}
	return ( get_clan_id() == targetID );
}

boolean [slot] alternateSlots( slot s ) {
	boolean [slot] slotList;
	switch(s) {
		case $slot[folder1]:
		case $slot[folder2]:
		case $slot[folder3]:
		case $slot[folder4]:
		case $slot[folder5]:
			return $slots[folder1,folder2,folder3,folder4,folder5];
		case $slot[sticker1]:
		case $slot[sticker2]:
		case $slot[sticker3]:
			return $slots[sticker1,sticker2,sticker3];
		case $slot[acc1]:
		case $slot[acc2]:
		case $slot[acc3]:
			return $slots[acc1,acc2,acc3];
		case $slot[weapon]:
			slotList[$slot[weapon]] = true;
			if ( have_skill($skill[Double-Fisted Skull Smashing]) )
				slotList[$slot[off-hand]] = true;
			if ( my_familiar() == $familiar[disembodied hand] )
				slotList[$slot[familiar]] = true;
			return slotList;
		case $slot[off-hand]:
			if ( my_familiar() == $familiar[left-hand man] )
				return $slots[off-hand,familiar];
	}
	slotList[s] = true;		// No exception for hats/pants, since the hatrack/scarecrow don't keep the original functionality.
	return slotList;
}

void boomBox( string desiredSong ) {
	static {
		boolean [string] directCommands = $strings[giger,spooky,food,alive,dr,fists,damage,meat,silent,off,1,2,3,4,5,6];
		string [string] boombox;
		boombox["giger"] = "Eye of the Giger";
		boombox["spooky"] = "Eye of the Giger";
		boombox["1"] = "Eye of the Giger";
		boombox["food"] = "Food Vibrations";
		boombox["2"] = "Food Vibrations";
		boombox["alive"] = "Remainin' Alive";
		boombox["dr"] = "Remainin' Alive";
		boombox["3"] = "Remainin' Alive";
		boombox["fists"] = "These Fists Were Made for Punchin";
		boombox["damage"] = "These Fists Were Made for Punchin";
		boombox["4"] = "These Fists Were Made for Punchin";
		boombox["meat"] = "Total Eclipse of Your Meat";
		boombox["5"] = "Total Eclipse of Your Meat";
		boombox["silent"] = "";
		boombox["off"] = "";
		boombox["6"] = "";
	}

	if ( get_property_int("_boomBoxSongsLeft") > 0 ) {
		foreach c,s in boombox {
			if ( desiredSong == c || desiredSong == s ) {
				if ( get_property("boomBoxSong") != s )
					cli_execute("boombox "+c);
				return;
			}
		}
	}
	print("Couldn't switch to requested boombox song: "+desiredSong);
}

boolean MaySaber( int upgrade ) {
	if ( get_property_int("_saberMod") == 0 && retrieve_item(1,$item[Fourth of May Cosplay Saber]) ) {
		page = visit_url("main.php?action=may4");
		run_choice(upgrade);
	}
	return ( get_property_int("_saberMod") == upgrade );
}

boolean isClub ( item it ) {
	if ( !has_effect($effect[iron palms]) && have_skill($skill[iron palm technique]) )
		use_skill(1,$skill[iron palm technique]);

	if ( item_type(it) == "club" )
		return true;
	if ( item_type(it) == "sword" )
		return ( has_effect($effect[iron palms]) );
	return false;
}

string stripLastEncounter() {		// for devreasons
	string s = get_property("lastEncounter");
	s = to_lower_case(s);
	int l = length(s);
	int index = index_of(s," (#",max(0,l-9));
	if ( index > 0 )
		s = substring(s, 0, index );
	return s;
}

boolean isLeapYear ( int year ) {
	if ( year % 400 == 0 )
		return true;
	if ( year % 100 == 0 )
		return false;
	if ( year % 4 == 0 )
		return true;
	return false;
}


string formatToday(string format) {
	return format_date_time("yyyyMMdd", today_to_string(), format);
}

boolean pvpSeasonEndsToday() {
	return ( formatToday("MM").to_int() % 2 == 0 && timestamp_to_date(date_to_timestamp("yyyyMMdd",today_to_string())+1000*60*60*24,"MM") != formatToday("MM") );
}

int songLimit() {
	int count = 3;
	if ( boolean_modifier("Four Songs") )
		count++;
	count += numeric_modifier("Additional Song");
	return count;
}

int songCount() {
	int count;
	foreach ef in my_effects()
		if ( ef.to_skill().class == $class[Accordion Thief] && ef.to_skill().buff )
			count++;
	return count;
}

int [effect] activeSongs() {
	int [effect] list;
	foreach ef in my_effects()
		if ( ef.to_skill().class == $class[Accordion Thief] && ef.to_skill().buff )
			list[ef] = have_effect(ef);
	return list;
}

effect [int] shortestSongs() {
	effect [int] list;
	foreach ef in my_effects()
		if ( ef.to_skill().class == $class[Accordion Thief] && ef.to_skill().buff )
			list[list.count()] = ef;
	sort list by mp_cost(value.to_skill());
	sort list by have_effect(value);
	return list;
}

boolean makeRoomSong() {
	if (songCount() < SongLimit())
		return true;
	foreach i,ef in shortestSongs()
		if ( songCount() >= songLimit() && have_skill(to_skill(ef)) && to_skill(ef).dailylimit < 0 )
			cli_execute("uneffect "+ef);
	return (songCount() < SongLimit());
}

effect currentExpression() {
	foreach ef in my_effects()
		if ( ef.to_skill().expression )
			return ef;
	return $effect[none];
}

effect currentDreadSong() {
	foreach ef in my_effects()
		if ( ef.to_skill().song )
			return ef;
	return $effect[none];
}

effect currentWalk() {
	foreach ef in my_effects()
		if ( ef.to_skill().walk )
			return ef;
	return $effect[none];
}

int [effect] activeAffirmations() {
	int [effect] list;
	foreach ef in my_effects()
		if ( $effects[Always be Collecting, Think Win-Lose, Become Superficially interested, Become Intensely interested, Adapt to Change Eventually, Be a Mind Master, Work For Hours a Week, Keep Free Hate in your Heart] contains ef )
			list[ef] = have_effect(ef);
	return list;
}

boolean hasUnderwaterEffect() {
	foreach ef in my_effects()
		if ( boolean_modifier(ef,"Adventure Underwater") )
			return true;
	return false;
}

boolean hasUnderwaterFamiliarEffect() {
	foreach ef in my_effects()
		if ( boolean_modifier(ef,"Underwater Familiar") )
			return true;
	return false;
}

int locationToInt( location l ) {
	if ( last_index_of(to_url(l),"snarfblat=") > 0 )
		return to_int(substring(to_url(l),last_index_of(to_url(l),"snarfblat=")+10));
	else
		return -1;
}

void BoostNonCombatRate() {
	if ( have_effect($effect[smooth movements]) < 2 && have_skill($skill[smooth movement]) )
		use_skill(1,$skill[smooth movement]);
	if ( has_effect($effect[Carlweather's Cantata of Confrontation]) )
		cli_execute("uneffect "+$effect[Carlweather's Cantata of Confrontation]);
	if ( have_effect($effect[The Sonata of Sneakiness]) < 2 && have_skill($skill[The Sonata of Sneakiness]) && (activeSongs() contains $effect[The Sonata of Sneakiness] || makeRoomSong()) )
		use_skill(1,$skill[The Sonata of Sneakiness]);
	if ( get_property("_horsery") != "dark horse" )
		cli_execute("horsery dark");
	if ( !has_effect($effect[Colorfully Concealed]) && my_location().environment == "underwater" && available_amount($item[mer-kin hidepaint])>0 )
		use(1,$item[mer-kin hidepaint]);
}

void BoostCombatRate() {
	if ( have_effect($effect[Musk of the Moose]) < 2 && have_skill($skill[Musk of the Moose]) )
		use_skill(1,$skill[Musk of the Moose]);
	if ( has_effect($effect[The Sonata of Sneakiness]) )
		cli_execute("uneffect "+$effect[The Sonata of Sneakiness]);
	if ( have_effect($effect[Carlweather's Cantata of Confrontation]) < 2 && have_skill($skill[Carlweather's Cantata of Confrontation])
		&& (activeSongs() contains $effect[Carlweather's Cantata of Confrontation] || makeRoomSong()) )
		use_skill(1,$skill[Carlweather's Cantata of Confrontation]);
	if ( get_property("_horsery") == "dark horse" )
		cli_execute("horsery crazy");
	if ( has_effect($effect[Colorfully Concealed]) && my_location().environment == "underwater" )
		cli_execute("uneffect "+$effect[Colorfully Concealed]);
}

boolean FolderHolderContains( item it ) {
	foreach s in $slots[folder1,folder2,folder3,folder4,folder5]
		if ( equipped_item(s) == it )
			return true;
	return false;
}

int FolderHolderContains( boolean [item] list ) {
	int n;
	foreach it in list
		if ( FolderHolderContains(it) )
			n++;
	return n;
}

void SnapperTracking(phylum tohunt, int limit) {	// TODO incoporotate snapper drop values in chooseFamiliar.ash
// Will only swap to new phylum if current progress is less than limit
	if ( to_phylum(get_property("redSnapperPhylum")) != tohunt ) {
		page = visit_url("familiar.php?action=guideme&pwd");
		if ( to_phylum(get_property("redSnapperPhylum")) != tohunt && get_property_int("redSnapperProgress") < limit )
			visit_url("choice.php?pwd&whichchoice=1396&option=1&cat="+replace_string(to_string(tohunt),"-",""));
		else
			run_choice(2);
	}
}

int famWeight(familiar f) {
	int weight;
	weight = familiar_weight(f)+weight_adjustment();
	if ( my_familiar() == f && visit_url("charpane.php").contains_text(", the <i>extremely</i> well-fed") )
		weight = weight + 10;
	return weight;
}

float RangeAverage( string range , string delimiter ) {
	string [ int ] values = split_string(range, delimiter);
	if ( count(values) == 1 ) {
		if ( is_integer(range) )
			return to_float(range);
		if ( to_string(to_float(range)) == range )
			return to_float(range);
	}
	else if ( count(values) == 2 && is_integer(values[0]) && is_integer(values[1]) )
		return (to_int(values[0])+to_int(values[1]))/2.0;
	abort("Couldn't properly average the range \""+range+"\".");
	return 0.0;
}

float RangeAverage( string range ) {
	return RangeAverage( range, "-" );
}

boolean MayoClinicAvailable() {
	if ( !(get_campground() contains $item[portable Mayo Clinic]) && !get_property_bool("_workshedItemUsed") && available_amount($item[portable Mayo Clinic])>0
		&& user_confirm("Do you want to install your mayo clinic?",30000,false) ) {
		retrieve_item(1,$item[portable Mayo Clinic]);
		use(1,$item[portable Mayo Clinic]);
	}
	return (get_campground() contains $item[portable Mayo Clinic]);
}

void tryNumberology() {
	int target = 69;
	if ( bossKilling )
		target = 14;
	else if ( to_float(get_property("Dic.pvpValue")) > 1 && hippy_stone_broken() )
		target = 37;
	while ( reverse_numberology() contains target && get_property_int("_universeCalculated")<get_property_int("skillLevel144") )
		cli_execute("numberology "+target);
}

boolean LeftHandManItems() {
	foreach it in $items[rusty kettle bell, glued-together crystal ball, martini dregs]
		if ( total_amount(it) < 2 )
			return true;
	if ( mall_price($item[Left-Hand Man action figure])/11/11 > mall_price($item[power pill]) )
		return true;
	return false;
}

void getFights() {
	if ( hippy_stone_broken() && !bossKilling && can_interact() ) {
		if ( !contains_text(to_lower_case(get_property("_deckCardsSeen")),to_lower_case("clubs")) && my_adventures() > 0 )
			cli_execute("cheat clubs");
		if ( get_property_int("_meteoriteAdesUsed")<3 && StockUp(3,$item[meteorite-ade],5678,9876) )
			use(3-get_property_int("_meteoriteAdesUsed"),$item[meteorite-ade]);

		if ( !get_property_bool("_daycareFights") && my_adventures() > 0 ) {
			page = visit_url("place.php?whichplace=town_wrong&action=townwrong_boxingdaycare");
			if ( !page.contains_text("a door to a spa to your left") )
				abort("We got lost in a daycare, didn't we?");
			else
				page = visit_url("choice.php?whichchoice=1334&option=3");
			page = visit_url("choice.php?whichchoice=1336&pwd&option=4");
		}
	}
	else
		abort("Break your stone, or stop bosskilling");
}

int freeStomach() {
	return (fullness_limit()-my_fullness());
}

int freeLiver() {
	return (inebriety_limit()-my_inebriety());
}

boolean Drunk() {
	return (inebriety_limit()-my_inebriety()<0);
}

int freeSpleen() {
	return (spleen_limit()-my_spleen_use());
}

boolean TerminalEducate(boolean [string] skills) {
	if ( count(skills)>2 ) {
		dump(skills);
		abort("Dic: You can't know more than 2 terminal skills at once");
	}

	boolean tryagain = false;
	repeat {
		tryagain = false;
		foreach s in skills
			if ( get_property("sourceTerminalEducate1") != s && get_property("sourceTerminalEducate2") != s ) {
				cli_execute("terminal educate "+s);
				tryagain = true;
			}
	} until ( !tryagain );

	foreach s in skills
		if ( get_property("sourceTerminalEducate1") != s && get_property("sourceTerminalEducate2") != s )
			abort("Couldn't learn desired terminal skills");
	return true;
}

void ReDigitize(int round, monster mob, string text) {
	if ( round > 1 )
		abort("Spent rounds before trying to digitize");
	if ( !($monsters[witchess knight, witchess bishop, witchess rook, witchess pawn, Knob Goblin Embezzler] contains mob) )
		steal();
	if ( $monsters[time-spinner prank, eldritch tentacle] contains mob )
		print("Not redigitizing monster "+mob,"blue");
	else if ( get_property("_sourceTerminalDigitizeMonster").to_monster() == $monster[none] || get_property("_sourceTerminalDigitizeMonster").to_monster() == mob && have_skill($skill[Digitize]) ) {
		page = use_skill($skill[digitize]);
		if ( !contains_text(page,"quickly copy the monster") ) {
			print_html(page);
			abort("Redigitize: Failed to redigitize, check combat message");
		}
	}
	else
		abort("Unexpected monster when trying to redigitize");
	page = visit_url("fight.php?action=macro&macrotext=&whichmacro=148055");
}

boolean DoRedigitize() 	{
	int EncounterNumber = get_property_int("_sourceTerminalDigitizeMonsterCount")+1;
	if ( get_property_int("_sourceTerminalDigitizeUses") >= 3 )
		return false;
	else
		return (2+EncounterNumber*5+(EncounterNumber+1)*EncounterNumber*5 > my_adventures()/(3-get_property_int("_sourceTerminalDigitizeUses")));
	// Middle between expected number of adventures of consecutive digitize monster chain lengths. AKA: (27+37)/2 = 42 = 2+2*5+(2+1)*2*5
}

int NormalRewardValue,HardmodeRewardValue;
void NEPRewardValue() {
	NormalRewardValue = itemValue($item[TRIO cup of beer]) + itemValue($item[party platter for one]) + itemValue($item[Party-in-a-Can&trade;]);
	HardmodeRewardValue = itemValue($item[party beer bomb]) + itemValue($item[sweet party mix]) + itemValue($item[party balloon]) + itemValue($item[Neverending Party guest pass])/5;
}

location [int] LocationList;
void FillLocationList() {
	foreach l in $locations[]
		if ( starts_with(to_url(l),"adventure.php") )
			LocationList[l.to_url().split_string("=")[1].to_int()] = l;
}

int ProfessorLectures() {
	return ceil(famWeight($familiar[Pocket Professor])**0.5)+(familiar_equipped_equipment($familiar[pocket professor]) == $item[pocket professor memory chip] ? 2 : 0);
}

void buffUpLectures(int turns) {
	if ( my_path() == "Heavy Rains" && !hasUnderwaterFamiliarEffect() )
		use(1,$item[willyweed]);
	foreach s in $skills[Empathy of the Newt, Blood Bond, Leash of Linguini]
		while ( have_skill(s) && my_mp() > mp_cost(s) && have_effect(to_effect(s)) < turns )
			use_skill(1,s);
	while ( get_property_int("_poolGames") < 3 && have_effect($effect[Billiards Belligerence]) < turns && (get_clan_lounge() contains $item[Clan pool table] || switchClan(homeClanId)) ) // AfHk
		cli_execute("pool 1");
	if ( !get_property_bool("_witchessBuff") && !has_effect($effect[Puzzle Champ]) )
		cli_execute("witchess");
	if ( get_property_int("_freeBeachWalksUsed") < 11 && !has_effect($effect[Do I Know You From Somewhere?]) && !contains_text(get_property("_beachHeadsUsed"),"10") )
		cli_execute("beach head familiar");
	while ( get_property_bool("getawayCampsiteUnlocked") && get_property_int("_campAwaySmileBuffs") < 3
		&& get_property("_campAwaySmileBuffSign") == "Platypus"  && have_effect($effect[Smile of the Platypus]) < turns && have_effect($effect[Big Smile of the Platypus]) < turns )
		page = visit_url("place.php?whichplace=campaway&action=campaway_sky");
	while ( have_effect($effect[Curiosity of Br'er Tarrypin]) < turns )
		use_skill(1,$skill[Curiosity of Br'er Tarrypin]);
	if ( !get_property_bool("friarsBlessingReceived") && !has_effect($effect[Brother Corsican's Blessing]) )
		cli_execute("friars familiar");
	if ( !get_property_bool("_defectiveTokenUsed") && !has_effect($effect[Video... Games?]) )
		use(1,$item[defective game grid token]);
	if ( use_familiar($familiar[Pocket Professor]) )
		page = visit_url("familiar.php");
	if ( $familiar[pocket professor].experience == 400 )
		print("This professor experience doesn't seem right","red");
	else {
		print("experience: "+$familiar[pocket professor].experience,"blue");
		if ( $familiar[pocket professor].experience < 1600 ) {
			while ( have_effect($effect[Heart of White]) < turns && available_amount($item[white candy heart])>0 )
				use(1,$item[white candy heart]);
		}
		if ( $familiar[pocket professor].experience < 1200 ) {
			StockUp(5,$item[pulled blue taffy],678,987);
			while ( have_effect($effect[Blue Swayed]) < 50+turns && available_amount($item[pulled blue taffy])>0 )
				use(1,$item[pulled blue taffy]);
		}
	}
	if ( use_familiar($familiar[Pocket Professor]) )
		if ( available_amount($item[moveable feast])>0 && !get_property("_feastedFamiliars").contains_text("Pocket Professor") && get_property_int("_feastUsed")<5 )
			use(1, $item[moveable feast]);
	if ( ceil(famWeight($familiar[pocket professor])**0.5)**2+1 - famWeight($familiar[pocket professor]) < 6 && !has_effect($effect[Bestial Sympathy])
		|| has_effect($effect[Bestial Sympathy]) && have_effect($effect[bestial sympathy]) < turns )
		while ( have_effect($effect[bestial sympathy]) < turns )
			use(1,$item[half-orchid]);
	if ( ceil(famWeight($familiar[pocket professor])**0.5)**2+1 - famWeight($familiar[pocket professor]) < 3 && !has_effect($effect[Heart of White])
		|| has_effect($effect[Heart of White]) && have_effect($effect[Heart of White]) < turns )
		while ( have_effect($effect[Heart of White]) < turns )
			use(1,$item[white candy heart]);
	print("Professor weight before: "+famWeight($familiar[pocket professor]));
}

void buffUpLectures() {
	buffUpLectures( ProfessorLectures()-get_property_int("_pocketProfessorLectures") );
}

boolean pantsgivingIncreaseAvailable() {
	return get_property_int("_pantsgivingFullness") < length(to_string(get_property_int("_pantsgivingCount")/5));
}

int UsableEquipAmount( item it ) {
	slot s = to_slot(it);
	if ( BasicSlots contains s && boolean_modifier(it,"Single Equip") )
		return 1;
	if ( s == $slot[weapon] && weapon_hands(it)==1 && !($strings[chefstaff,accordion] contains item_type(it)) )
		return 3;
	if ( s == $slot[acc1] )
		return 3;
	if ( $slots[off-hand,pants,hat] contains s )
		return 2;
	if ( BasicSlots contains s )
		return 1;
	else
		return -1;
}

void PrepareMayo ( string mayo ) {
	mayo = to_lower_case(mayo);
	if ( $strings[mayodiol,mayoflex,mayonex,mayostat,mayozapine] contains mayo ){
		if ( get_property("mayoInMouth").to_lower_case() != mayo && MayoClinicAvailable() && get_property("mayoMinderSetting").to_lower_case() != mayo )
			cli_execute("mayominder "+mayo);
	}
	else
		abort("PrepareMayo: couldn't recognize the requested mayo type: "+mayo);
}

int dateDiff(string format1, string date1, string format2, string date2) {
	int timestamp1 = date_to_timestamp(format1, date1);
	int timestamp2 = date_to_timestamp(format2, date2);
	float difference = timestamp2-timestamp1;
	difference /= 1000.0;		// milliseconds
	difference /= 60.0;			// seconds
	difference /= 60.0;			// minutes
	difference /= 24.0;			// hours
	return to_int(difference);
}

boolean usesRemaining(string prop, int limit) {
	if ( prop == "" )
		return true;
	if ( is_integer(get_property(prop)) )
		return (limit > get_property_int(prop));
	else
		return !get_property_bool(prop);
}
