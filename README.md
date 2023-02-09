# pTrack
Thank you to The Dictator and Thoth19 for the majority of the code. Without The Dictator's ProfitTracking.ash and DicsLibrary.ash and Thoth19's TimeTracking.ash this script would not exist.  

This script functions as a CLI wrapper of their profit trackers to allow you to add breakpoints, keep a daily list of today's breakpoints, and compare breakpoints in order to track profits.

To install, run   
`git checkout https://github.com/Prusias-kol/pTrack main`   

## How to Use
Type `ptrack help` in the gCLI to see available commands.

To add a breakpoint, type `ptrack add <breakpoint name>`

To list today's breakpoints (or yesterdays if you haven't yet set a breakpoint today), type `ptrack list`

To compare two breakpoints (from today or yesterday if you haven't yet set a breakpoint today), type `ptrack compare <bp1> <bp2>`

To compare all breakpoints on ptrack list, type `ptrack recap`
