# Bees Nest

A turn-based hex game for 1 to 4 players, on one device or each on their own. The hive is a hexagon of 271 cells (10 per side).
On your turn you fill one empty cell. Any empty cell touching 3 or more filled cells fills itself, and those can set off
more in a chain. Cells that fill themselves belong to whoever's click set them off.

| Player | Clicked cells | Auto-filled cells |
|---|---|---|
| Player 1 | blue | orange |
| Player 2 | red | green |
| Player 3 | purple | yellow |
| Player 4 | pink | dark green |

Points = your auto-filled cells minus your clicked cells. When the hive is full, the most points wins.

**Gray hexes**: before starting, you can pick a number of gray hexes (up to 100) to scatter at random. They belong to nobody
and score nothing, but they count as filled, so they help set off chains. If the scattered grays already surround an
empty cell, that cell turns gray too, and so on, before anyone plays. Online, the host picks the number in the room.

## Playing

- **Play on this device**: pick 1 to 4 players and type names if you like (blank ones are called Player 1, Player 2…), then take turns on the same screen.
- **Play on separate devices**: **create a room**, then friends join with the 4-letter code. Players get colors in the order they join. The host presses Start.
- On your turn, hover over an empty cell (or tap it once on a phone) to see what it would set off and how many points it's worth, then click (or tap again) to place it.
- Clicked cells have a white dot; the outlined cell is the latest move.
- Online, the host should keep the game open. If the host leaves, the room closes. If another player leaves, their turns are skipped.

## Files

- `index.html`: screens and styles.
- `beesnest.js`: the board, the rules, and the online rooms (Firebase Realtime Database, `beesnest/rooms/<CODE>` in the `kvgames` project).
  Rooms store only the list of moves; every device replays them to build the same board.
- `reference/`: Hex Cascade, the single-player toy this game started from.

To run it locally, serve the folder with any static file server, for example `python3 -m http.server`.
