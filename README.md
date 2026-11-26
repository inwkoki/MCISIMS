# MCISIMS — MCI tabletop simulator (KKU)

Web-based mass-casualty-incident tabletop map for Srinagarind Hospital / Central Khon Kaen Campus / KKU.
Live: https://inwkoki.github.io/MCISIMS/

## Features
- Real map (OpenStreetMap street, Esri satellite, hybrid) with quick jumps to Srinagarind, Central Khon Kaen Campus, KKU
- Component palette: signs (Triage / Treatment R-Y-G / Command Post / Loading / Staging / Entrance / Exit / Morgue …), vehicles (ALS/BLS, rescue, fire, police, bus, helicopter), staff roles (IC, MC, triage/treatment/transport officers, MD, RN, EMT …), patients (red/yellow/green/black/untriaged, auto-numbered, notes), hot/warm/cold zones, barrier tape, flow arrows, cones, flags, tents, notes
- **Live multi-device sync** — everyone with the same room link sees the same map; drag updates stream in real time
- Room link + QR code, online list, shared scenario timer, activity log (CSV export), triage counter
- "Bring everyone to my view", view-only mode for observers, JSON export/import of scenarios, local backup

## How sync works
Static site (GitHub Pages) + public MQTT broker over WebSocket (HiveMQ by default, EMQX as fallback).
Each map item is a retained message on `kkumcisim/v1/<ROOM>/i/<id>`. No account or server needed.
**Note:** public brokers are open — anyone who knows the room code can see/edit. Don't put real patient data in it.
Retained data on public brokers is not guaranteed forever: use ☰ → Export to keep scenarios.

## Use
1. Open the site → enter your name → you get a room (e.g. `KKU-AB12`)
2. Tap **Room** to show link + QR; other PCs/phones open it and join the same map
3. Tap a component in the palette, then tap the map to place it. Drag to move, tap to edit/rotate/delete.
   Lines (tape/arrows): tap points, then **Finish**.
