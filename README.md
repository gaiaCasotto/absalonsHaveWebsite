# Absalons Have website (first draft)

A full-screen page with a 3D toad sitting on the ground. The horizon is a
quarter of the way up from the bottom of the screen. Tap the toad and it
hops to another spot on the ground.

The site is one page with several views, chosen by the address:

- home (no `#`): the title, the menu and the year links.
- `#2027` ("Next Year") and `#2026` ("Last Year") share the 3D scene with
  home. Changing between them slides the ground sideways and leaves the toad
  behind, then the toad hops in after you: from the left when you go forward
  in time, from the right when you go back. On a phone the screen is too
  narrow for a side, so it lands in the middle.
- `#2026` also has the 2026 line-up and pictures. They scroll in a window
  between the "2026" heading and the horizon: they rise from behind the
  horizon and fade out at the top, while the heading, the dates and the play
  button scroll up and fade away. On phones the line-up lines are split in
  two and the pictures come one after another.
- `#info` and `#krolle-bolle` are plain dark: the night scene fades out
  behind them. Info has the About text, a search field and the frequently
  asked questions. Each answer goes in its `<div class="info-body">` in
  `index.html`; the search looks through the titles and that text.

The play buttons (2026, 2027, Info) turn into the spinning logo when clicked
and back again. They do not play a track yet; it is to be started and
stopped in `main.js` under "Play button".

## Run it

The browser will not load the 3D model straight from a file, so serve the
folder locally:

    cd ~/AbsalonsHave/site
    python3 serve.py

Then open http://localhost:8000. (`serve.py` is Python's built-in server,
but it stops the browser from keeping old copies of the files, so a normal
reload shows your latest changes.) To try it on a phone or iPad on the same
Wi-Fi, run `python3 serve.py 8000 0.0.0.0` and open
`http://<this Mac's IP address>:8000` on the phone.

## Files

- `index.html`, `style.css`, `main.js`: the page.
- `serve.py`: the local server described above.
- `assets/toad.glb`: the Fowler's toad scan, reduced from 1.4 million to
  about 30,000 faces with a 2048 px texture (2.8 MB). The scanning plate
  under the toad was removed and the toad faces +Z.
- `assets/2026/`: the pictures on the 2026 page.
- `assets/logo-toad.png`: the logo, for the Info page and the play buttons.
- `assets/ground-strip.png`: the speckled ground at the bottom of the Info page.
- `fonts/BoecklinsUniverse.woff2`: Boecklins Universe by Peter Wiegel,
  SIL Open Font License (`fonts/BoecklinsUniverse-OFL.txt`).
- `fonts/Inter-Regular.woff2`: Inter by The Inter Project Authors, SIL Open
  Font License (`fonts/Inter-OFL.txt`), for the answers on the Info page.
- Both fonts are cut down to Latin letters, including æ, ø and å.

## Still to do

- The play buttons need the track.
- The hop is a placeholder made in code: the whole toad moves in an arc
  without moving its legs. It is to be replaced by a hop animated in Blender.
