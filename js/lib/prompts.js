// A deck of brainstorming prompts. {here} is replaced with the block you're
// working on (e.g. “Ferry at dawn”) or “the book”.

export const DECK = {
  'What if': [
    'What if the opposite of what {here} sets up turned out to be true?',
    'What if someone in {here} is lying? Who, and about what?',
    'What if {here} happened ten years earlier, or ten years later?',
    'What if the quietest person in {here} made the decision instead?',
    'What if the thing everyone wants in {here} is already lost?',
    'What if {here} ended one beat sooner? What would the reader have to supply?',
    'What if a stranger walked into {here}? What would they notice first?',
    'What if {here} were told as a list, a letter, or a set of instructions?',
  ],
  Character: [
    'Who wants something in {here} and can’t say it out loud?',
    'Write the thing someone in {here} would never admit, in their own voice.',
    'What does each person in {here} think is really going on?',
    'What habit, object or gesture belongs to one character here and nobody else?',
    'Who is having a worse day than the protagonist in {here}? Why?',
    'What is your protagonist wrong about, right now, in {here}?',
    'Describe a character in {here} only by what they do with their hands.',
    'Who would be most upset to read {here}? Why?',
  ],
  Stakes: [
    'What’s the worst thing that could happen in {here}? Is it happening?',
    'What does the reader know in {here} that the characters don’t, or the other way round?',
    'What does getting what they want in {here} cost?',
    'Add a clock: what deadline could press on {here}?',
    'What question does {here} leave open, and how long can you hold it?',
    'Where might a reader stop caring in {here}? What would pull them back?',
    'What small promise does {here} make, and where does it get paid off?',
  ],
  'Senses & place': [
    'List five sounds that belong in {here}. Keep one.',
    'What does {here} smell like? What memory does that hook?',
    'Describe the weather in {here} as if it had an opinion.',
    'Zoom in: pick one object in {here} and give it a whole paragraph.',
    'What’s on the floor, the walls, the table in {here}? What was left behind?',
    'Imagine {here} from a child’s height, or from someone lying down.',
    'What time of day is {here}? Move it and see what changes.',
  ],
  Structure: [
    'If {here} were cut entirely, what would be lost? Write that down.',
    'What’s the turn in {here}, the moment something changes? Say it in one sentence.',
    'Start {here} later. Where’s the latest possible way in?',
    'What earlier moment does {here} echo? What later moment should echo it?',
    'Swap {here} with its neighbour. Does anything interesting happen?',
    'What does the reader need to know before {here}, and not a moment sooner?',
    'Write the last line of {here} first.',
    'What is {here} really about, underneath what it’s about?',
  ],
  'Play & constraint': [
    'Write 100 words of {here} without a single adjective.',
    'Tell {here} as a text-message exchange.',
    'Retell {here} in exactly six words.',
    'Write the version of {here} you’re afraid is too much. Keep the best line.',
    'Write the moment just before {here}, the one the reader will never see.',
    'Pour {here} into a borrowed form: a recipe, a court transcript, a weather report.',
    'Write the worst possible version of {here} on purpose. What’s hiding in it?',
    'List ten titles for {here}. The seventh is usually the interesting one.',
  ],
  Argument: [
    'What’s the strongest objection to {here}? Let it speak in full.',
    'What story or example would make {here} land for a sceptic?',
    'What do you believe about {here} that you haven’t said yet?',
    'What surprised you when you first started thinking about {here}?',
  ],
};

const all = Object.entries(DECK).flatMap(([category, list]) => list.map((text) => ({ category, text })));
let lastIdx = -1;

export function dealPrompt(here) {
  let i;
  do i = Math.floor(Math.random() * all.length); while (i === lastIdx && all.length > 1);
  lastIdx = i;
  const card = all[i];
  return { category: card.category, text: card.text.replaceAll('{here}', here) };
}
