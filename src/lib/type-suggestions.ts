import type { SuggestionGroup } from './suggestions';

export const TYPE_GROUPS: readonly SuggestionGroup[] = [
  {
    label: 'Card types',
    items: ['Creature', 'Instant', 'Sorcery', 'Enchantment', 'Artifact', 'Land', 'Planeswalker', 'Battle', 'Tribal', 'Legendary', 'Basic Land'],
  },
  {
    label: 'Creature types',
    items: [
      'Human', 'Warrior', 'Wizard', 'Soldier', 'Spirit', 'Elf', 'Cleric', 'Elemental', 'Rogue', 'Zombie', 'Goblin', 'Beast', 'Knight',
      'Phyrexian', 'Shaman', 'Bird', 'Dragon', 'Vampire', 'Druid', 'Cat', 'Horror', 'Merfolk', 'Artificer', 'Scout', 'Insect', 'Hero',
      'Angel', 'Construct', 'Giant', 'Noble', 'Warlock', 'Mutant', 'Dinosaur', 'Demon', 'Ally', 'Villain', 'Lizard', 'Eldrazi', 'Advisor',
      'Snake', 'Pirate', 'Dwarf', 'Shapeshifter', 'Faerie', 'Avatar', 'Berserker', 'Golem', 'Assassin', 'Dog', 'Wall', 'Monk', 'Robot',
      'Spider', 'Ogre', 'Ninja', 'Orc', 'Archer', 'Rat', 'Treefolk', 'Citizen', 'Sliver', 'Wurm', 'Minotaur', 'Drake', 'Wolf', 'Illusion',
      'Plant', 'Elephant', 'Nightmare',
    ],
  },
];
