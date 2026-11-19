/** Lore notes for every map. `{D}` is replaced at runtime by a keypad digit (Halcyon Station). */
export interface LoreNote { id: string; map: string; title: string; stamp?: string; body: string }

export const LORE: LoreNote[] = [
  {
    id: 'note1', map: 'ravenmoor', title: 'Admission Memo — 3 March 1944', stamp: 'HALCYON S.C.',
    body: `By order of the Halcyon Signal Corps, forty (40) subjects are transferred from the eastern line to Ravenmoor for Project TETHER.

All subjects are volunteers. Staff will not refer to them as "patients", "prisoners" or "the poor devils in Ward B".

Peace Through Signal.
— Office of the Director`,
  },
  {
    id: 'note2', map: 'ravenmoor', title: 'Night Nurse’s Diary',
    body: `They hum now. All of them. The same note, even asleep, like a wet finger round a glass.

Dr. Vossler says it is only the Tether "settling in".

Bed 14 bit me tonight. Then he apologised in a voice that wasn’t his, and smiled, and went on humming.`,
  },
  {
    id: 'note3', map: 'ravenmoor', title: 'Surgical Log — Procedure 31', stamp: 'CLASSIFIED',
    body: `Copper housing seated against the parietal bone. Six staples. Valve glass intact.

On first activation the subject recited the Halcyon creed in full and wept with gratitude.

Note for the Corps: the light on the unit flickers in time with his pulse. Recommend we stop calling that "a defect". It is the most honest thing in this building.`,
  },
  {
    id: 'note4', map: 'ravenmoor', title: 'Boiler Room — Maintenance Request',
    body: `The transmitter is forty miles off but the boilers sing with it every night at 2am. The pipes knock in rhythm. I counted it. It’s the creed.

Requesting transfer.

[STAMPED: DENIED. Keep the water hot. They like it hot.]`,
  },
  {
    id: 'note5', map: 'ravenmoor', title: 'The Director’s Letter (unsent)', stamp: 'PRIVATE',
    body: `To Command —

The signal has drifted. The subjects no longer answer to the creed. They answer to something else, something underneath the carrier tone.

I have taken precautions. I have Tethered myself. Several times. Someone must stay in charge of them, and they will only follow a voice that sounds like theirs.

If the radio in the theater ever finds my frequency, do not answer.`,
  },
  {
    id: 'note6', map: 'station', title: 'Shipping Manifest — Dock 2', stamp: 'FRAGILE',
    body: `40 crates, TETHER units, 400 per crate. DO NOT stack within 50 yards of the transmitter. DO NOT open crates that are warm.

Override keypad — sequence fragment I of IV: {D}`,
  },
  {
    id: 'note7', map: 'station', title: 'Foreman’s Report — Line 3',
    body: `Line 3 is behind quota again. The girls won’t touch the units after dark — say they whisper from inside the crates.

I told them chips don’t whisper. Then I put my ear to one.

Fragment II of IV: {D}`,
  },
  {
    id: 'note8', map: 'station', title: 'Generator Hall — Engineering Note',
    body: `Capacitor bank B arcing again. Reminder to all crews: to cut the roof array over to manual, the three relay pylons must each be energised and HELD until they lock. Whatever is downstairs will not like it.

Fragment III of IV: {D}`,
  },
  {
    id: 'note9', map: 'station', title: 'Control Room Log, Final Entry', stamp: 'URGENT',
    body: `The Mother Transmitter no longer accepts manual input. It retuned itself at 03:14 and began broadcasting a new creed.

It is not ours. It is beautiful. Half the shift walked up to the roof to listen.

Fragment IV of IV: {D}`,
  },
  {
    id: 'note10', map: 'station', title: 'Scrawled on a Clipboard',
    body: `If you are reading this: CUT THE SIGNAL.

Power the three relays. Hold them. Punch the four fragments into the control-room keypad, in order.

It will come for you when you do. Shoot whatever glows.`,
  },
  {
    id: 'note11', map: 'grounds', title: 'Pilot’s Logbook — Halcyon Courier 7', stamp: 'HALCYON S.C.',
    body: `03.III.44. Cargo: 40 replacement chips, crated, for Ravenmoor. Weather fair.

18:20 — compass spinning. Radio full of a tone I can feel in my teeth.

18:31 — Jessop says the tower light is "calling us down". He has stopped answering to Jessop.

18:34 — he has his hand on the stick and he is smiling and he is humming and I cannot

[the rest of the page is scorched]`,
  },
  {
    id: 'note12', map: 'grounds', title: 'Groundskeeper’s Ledger',
    body: `Feb. — Dug forty graves on the Director’s orders. In advance. He would not say why.

Feb. — Fitted a bell to every coffin, as he asked. "In case they wake," he said, and laughed.

2 March — Stopped laughing. Three bells rang in the night. Nobody was in those graves yet.

They ring when the light on the tower changes. I have started to understand the pattern. I wish I hadn’t.`,
  },
  {
    id: 'note13', map: 'grounds', title: 'Notice — Nailed to the Main Gate', stamp: 'BY ORDER',
    body: `RAVENMOOR ESTATE — HALCYON SIGNAL CORPS

Visitors will report to the Front Drive and wait.
Visitors will not enter the asylum.
Visitors will NOT look directly at the tower light.

Any visitor found humming will be detained for their own comfort.

Peace Through Signal.`,
  },
  {
    id: 'note14', map: 'grounds', title: 'Chalked Inside the Mausoleum Door',
    body: `the light on the tower is not a lamp it is an EAR

it listens through the chips and the chips listen through us

the bells wake it up. a flare blinds it. the pilot had a flare gun I saw it

you would have to stand under the tower while it burned. nobody would be that stupid

— E.`,
  },
];


export const FREQUENCIES = ['5.40', '7.15', '9.85', '11.20'];
