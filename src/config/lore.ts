/** Lore notes for every map — one story: the chips, the Chorus, and Director Hale. See GAME_DESIGN.md → Story. `{D}` is replaced at runtime by a keypad digit (Halcyon Station). */
export interface LoreNote { id: string; map: string; title: string; stamp?: string; body: string }

export const LORE: LoreNote[] = [
  // ------------------------------------------------------------ RAVENMOOR ASYLUM
  {
    id: 'note1', map: 'ravenmoor', title: 'Admission Memo — Project TETHER', stamp: 'HALCYON S.C.',
    body: `Forty (40) volunteers are transferred to Ravenmoor for fitting.

Each subject receives one TETHER unit: a copper chip seated against the skull. The chip listens to the Halcyon carrier and sets the brain to the band it hears:

  5.40 — SETTLE (calm)        7.15 — OBEY
  9.85 — FURY (combat)       11.20 — WAKE (no sleep)

Staff will not call them "patients". They are soldiers who do not yet know it.

Peace Through Signal.
— Office of the Director, E. Hale`,
  },
  {
    id: 'note2', map: 'ravenmoor', title: 'Night Nurse’s Diary',
    body: `They all hum now. The same note, even asleep.

Bed 14 told me what Bed 31 dreamt last night. They have never spoken. Bed 31 is in the other wing.

Then Bed 14 smiled with somebody else’s smile and said: "We are not forty any more, Edith. We are one. We are listening."

— E.`,
  },
  {
    id: 'note3', map: 'ravenmoor', title: 'Surgical Log — Procedure 31', stamp: 'CLASSIFIED',
    body: `The units do not only receive. Each one sends the wearer’s brain rhythm back down the carrier so the Station can watch them.

Forty minds, echoing down the same band, into each other.

The echoes no longer fade. Last night the carrier held a rhythm none of the forty were making. It has preferences. It has moods. The orderlies have named it the Chorus.

I recommend we stop calling that a defect.
— Dr. Vossler`,
  },
  {
    id: 'note4', map: 'ravenmoor', title: 'Boiler Room — Maintenance Request',
    body: `The Director has had a second aerial put up on the clock tower. A blue lamp on top, wired to a set in his office.

"So they can hear me," he says.

Since it went up, the pipes knock in rhythm every night at 2am. The Chorus answering him? Arguing with him?

Requesting transfer.
[STAMPED: DENIED. Keep the water hot.]`,
  },
  {
    id: 'note5', map: 'ravenmoor', title: 'The Director’s Letter (unsent)', stamp: 'PRIVATE',
    body: `To Halcyon Command —

You asked for an army that never breaks. It is here. It is the Chorus: every chipped mind in the valley, thinking as one inside our signal.

It only lacks a will. The loudest mind on the band steers it, so I have made mine loud. I have taken seven chips. The blue light carries my voice into it.

It is beginning to obey. When it does, it obeys ME — not the Corps.
— E. Hale, Director`,
  },
  // ------------------------------------------------------------ HALCYON SIGNAL STATION
  {
    id: 'note6', map: 'station', title: 'Shipping Manifest — Dock 2', stamp: 'FRAGILE',
    body: `40 crates, TETHER units, 400 per crate, for the Corps in the field.

Every unit shipped is another voice in the Chorus. Command says ship them anyway.

DO NOT open crates that are warm. DO NOT answer them.

Override keypad — fragment I of IV: {D}`,
  },
  {
    id: 'note7', map: 'station', title: 'Foreman’s Report — Line 3',
    body: `Line 3 is behind quota. The girls won’t touch the units after dark. They say the crates argue — two voices, one calm and one shouting orders.

I put my ear to one. The shouting one knew my name. It said it was the Director.

Fragment II of IV: {D}`,
  },
  {
    id: 'note8', map: 'station', title: 'Generator Hall — Engineering Note',
    body: `Since Ravenmoor went quiet, the Mother Transmitter draws double. Something is pushing on the carrier from inside.

To cut the roof array over to manual, the three relay pylons must each be energised and HELD until they lock. Whatever lives in the signal will not like it.

Fragment III of IV: {D}`,
  },
  {
    id: 'note9', map: 'station', title: 'Control Room Log, Final Entry', stamp: 'URGENT',
    body: `03:14 — the Mother Transmitter retuned itself. Not to any Halcyon band. To the Chorus’s own note.

04:00 — a second pattern on the scope, fighting the first. Seven overlapping rhythms. Hale’s, from the Ravenmoor files. Hale is dead. His voice came down the line anyway.

He wants the Chorus. The Chorus wants him out. The Tethered are caught between.

Fragment IV of IV: {D}`,
  },
  {
    id: 'note10', map: 'station', title: 'Scrawled on a Clipboard',
    body: `If you are reading this: CUT THE SIGNAL. Both of them live in it.

Power the three relays. Hold them. Punch the four fragments into the control-room keypad, in order.

Hale will come for you when you do — what’s left of him is wired into the Mother Transmitter. Shoot whatever glows.`,
  },
  // ------------------------------------------------------------ RAVENMOOR GROUNDS
  {
    id: 'note11', map: 'grounds', title: 'Pilot’s Logbook — Halcyon Courier 7', stamp: 'HALCYON S.C.',
    body: `03.III.44. Cargo: 40 replacement chips for Ravenmoor. Weather fair.

18:20 — radio full of voices, all singing the same note. Compass spinning.

18:31 — Jessop says the blue light on the tower is calling us down. He says it is the Director, and the Director wants his chips.

18:34 — Jessop is smiling and humming and he has the stick and I cannot

[the rest of the page is scorched]`,
  },
  {
    id: 'note12', map: 'grounds', title: 'Groundskeeper’s Ledger',
    body: `Feb. — Dug forty graves on the Director’s orders, in advance, for the ones who don’t survive tuning. A bell on every coffin. "In case they wake," he said.

1 March — The dead ones still have their chips. The Chorus still has them.

2 March — Three bells rang in the night. When the bells ring, the whole Chorus turns to listen — and the blue light flares to answer for it. I have started to understand the pattern. I wish I hadn’t.`,
  },
  {
    id: 'note13', map: 'grounds', title: 'Notice — Nailed to the Main Gate', stamp: 'BY ORDER',
    body: `RAVENMOOR ESTATE — HALCYON SIGNAL CORPS

Visitors will report to the Front Drive and wait.
Visitors will not enter the asylum.
Visitors will NOT look directly at the Director’s light.

Any visitor found humming will be detained for their own comfort.

Peace Through Signal.`,
  },
  {
    id: 'note14', map: 'grounds', title: 'Chalked Inside the Mausoleum Door',
    body: `the blue light is HALE. his voice going in, the Chorus listening out

ring the bells and the Chorus turns to the tower. then the light is wide open

a flare would blind it. the pilot had a flare gun, I saw it

blind him and nobody is steering. every one of them would drop. you would have to stand under the tower while it burned

— E.`,
  },
];

export const FREQUENCIES = ['5.40', '7.15', '9.85', '11.20'];
