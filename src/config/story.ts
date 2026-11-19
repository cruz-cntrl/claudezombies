/**
 * STORY — prologue cards and the line each room speaks when you first walk into it.
 * Lines deliberately echo the lore notes (config/lore.ts) so the two tell one story.
 */
export interface StoryCard { text: string; sub?: string }

export const PROLOGUE: Record<string, StoryCard[]> = {
  grounds: [
    { text: '1944.', sub: 'The war has taught everyone to be afraid.' },
    { text: 'The Halcyon Signal Corps promised an army that never would be.' },
    { text: 'PROJECT TETHER', sub: 'A copper chip, stapled to the skull. A carrier tone. A creed.' },
    { text: 'Forty volunteers were sent to Ravenmoor Asylum to be "settled in".' },
    { text: 'On the night of 3 March, Ravenmoor stopped answering the radio.' },
    { text: 'A courier plane sent to find out why came down in the north field.' },
    { text: 'Command sent one radio operator after it.', sub: 'You.' },
    { text: 'You reach the gates just after sunset.', sub: 'Above the asylum, a blue light is listening.' },
  ],
  ravenmoor: [
    { text: 'You survived the grounds.', sub: 'The asylum doors were never locked from the outside.' },
    { text: 'On the night of 3 March, the signal changed.', sub: 'Every chip started humming the same note.' },
    { text: 'Forty beds. Forty volunteers.', sub: 'None of them are in their beds.' },
    { text: 'The answer is inside.', sub: 'So are they.' },
  ],
  station: [
    { text: 'Three weeks after Ravenmoor fell silent…' },
    { text: 'the broadcast still comes from Halcyon Signal Station.', sub: 'Every chip within forty miles is listening.' },
    { text: 'At 03:14, the Mother Transmitter stopped taking orders.' },
    { text: 'Cut the signal.', sub: 'Or join it.' },
  ],
  test: [{ text: 'Test range.' }],
};

/** Keyed by map id, then zone letter. title = the card; line = the lore it whispers. */
export const ROOM_LINES: Record<string, Record<string, { title: string; line: string }>> = {
  grounds: {
    A: { title: 'THE FRONT DRIVE', line: 'The gate is chained from the inside. Somebody wanted the visitors kept in.' },
    B: { title: 'THE COURTYARD', line: 'The band played here every Sunday. The patients still gather, out of habit.' },
    C: { title: 'THE GRAVEYARD', line: 'Forty graves, dug in February. Every coffin has a bell. Every bell has rung.' },
    D: { title: 'THE CRASH FIELD', line: 'Halcyon Courier 7, carrying forty fresh chips. The tower called it down.' },
    E: { title: 'GROUNDSKEEPER’S YARD', line: 'He kept the generator fuelled and the graves dug. He kept a ledger, too.' },
    F: { title: 'THE CHAPEL', line: 'The candles are still burning. Nobody has lit them in a week.' },
  },
  ravenmoor: {
    A: { title: 'RECEPTION HALL', line: 'Visiting hours ended in 1943. Nobody told the patients.' },
    B: { title: 'THE PATIENT WARD', line: 'Forty beds. Forty volunteers. All of them still humming the same note.' },
    C: { title: 'OPERATING THEATER', line: '"Procedure 31 was a success," wrote Dr. Vossler. He wrote it about all of them.' },
    D: { title: 'THE BOILER ROOM', line: 'At 2 a.m. the pipes knock out the Halcyon creed. Somebody keeps the water hot.' },
    E: { title: 'THE COURTYARD', line: 'They used to walk the patients out here. Some of them never stopped walking.' },
    F: { title: 'THE RECORDS ROOM', line: 'The Director kept his letters here. He never sent the last one.' },
  },
  station: {
    A: { title: 'LOADING DOCK', line: 'Forty crates left this dock every night. Every one of them warm.' },
    B: { title: 'CHIP ASSEMBLY', line: 'Line 3 never made quota. The girls swore the crates whispered.' },
    C: { title: 'GENERATOR HALL', line: 'Enough current to reach every skull in the valley.' },
    D: { title: 'THE CONTROL ROOM', line: 'At 03:14 the Mother Transmitter retuned itself. Nobody here told it to.' },
    E: { title: 'TRANSMITTER ROOF', line: 'Half the night shift walked up here to listen. None of them came down.' },
  },
  test: {},
};

export const BOSS_LINES: Record<string, { title: string; line: string }> = {
  'The Warden': { title: 'THE WARDEN', line: 'Director of Ravenmoor. He Tethered himself — several times — to keep them in line.' },
  'The Mother Transmitter': { title: 'THE MOTHER TRANSMITTER', line: 'The source of the signal. Machine and flesh, broadcasting a creed of its own.' },
};
