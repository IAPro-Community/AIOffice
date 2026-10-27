// Temas de sala (puros): paletas claras e bem distintas. Sementes consecutivas (slots vizinhos)
// recebem temas diferentes; a ordem da lista alterna famílias de cor de propósito.
import type { MapThemeId, RoomTheme } from './api';

const THEMES: readonly RoomTheme[] = [
  { carpet: '#c9d1dc', carpet2: '#bdc6d3', wall: { base: '#eef1f4', trim: '#9fb0c4', pattern: 'plain' }, accent: '#3f7fd8', deskVariant: 'white', chairVariant: 'blue' },
  { carpet: '#dbcfba', carpet2: '#d0c2ab', wall: { base: '#f6f0e5', trim: '#b99f7a', pattern: 'stripes' }, accent: '#ec8a3c', deskVariant: 'wood', chairVariant: 'black' },
  { carpet: '#c4cfbb', carpet2: '#b8c5af', wall: { base: '#f1f3ea', trim: '#93a487', pattern: 'wood_panel' }, accent: '#4cae6a', deskVariant: 'wood', chairVariant: 'green' },
  { carpet: '#cdc8de', carpet2: '#c2bbd5', wall: { base: '#f3f1f8', trim: '#a59cc4', pattern: 'plain' }, accent: '#8d66cf', deskVariant: 'white', chairVariant: 'gray' },
  { carpet: '#e4cdbe', carpet2: '#dbc1b0', wall: { base: '#f8f1eb', trim: '#c99a83', pattern: 'plain' }, accent: '#e2604f', deskVariant: 'wood', chairVariant: 'red' },
  { carpet: '#bfd9d2', carpet2: '#b2cfc7', wall: { base: '#eef6f4', trim: '#7fb3a6', pattern: 'stripes' }, accent: '#36b0b0', deskVariant: 'white', chairVariant: 'green' },
  { carpet: '#aab1bd', carpet2: '#9fa7b4', wall: { base: '#e8eaee', trim: '#6d7583', pattern: 'brick' }, accent: '#f2c14e', deskVariant: 'dark', chairVariant: 'black' },
  { carpet: '#e0cad2', carpet2: '#d6bdc6', wall: { base: '#f9f2f4', trim: '#c08ea0', pattern: 'stripes' }, accent: '#e47aa8', deskVariant: 'white', chairVariant: 'black' },
  { carpet: '#c0d2e7', carpet2: '#b3c7e0', wall: { base: '#eef4fa', trim: '#8aa6c8', pattern: 'wood_panel' }, accent: '#5b8fe0', deskVariant: 'wood', chairVariant: 'blue' },
  { carpet: '#d1c5b8', carpet2: '#c5b8aa', wall: { base: '#f4efe8', trim: '#8a6a52', pattern: 'wood_panel' }, accent: '#c9713f', deskVariant: 'dark', chairVariant: 'gray' },
];

const THEMES_V2: readonly RoomTheme[] = [
  { carpet: '#607d79', carpet2: '#536f6b', wall: { base: '#e1ebe7', trim: '#69877d', pattern: 'plain' }, accent: '#e39a50', deskVariant: 'dark', chairVariant: 'blue' },
  { carpet: '#6b8179', carpet2: '#5b7169', wall: { base: '#e5ece3', trim: '#738c76', pattern: 'wood_panel' }, accent: '#d8944c', deskVariant: 'wood', chairVariant: 'black' },
  { carpet: '#5d7582', carpet2: '#506875', wall: { base: '#e0e9e9', trim: '#718d96', pattern: 'stripes' }, accent: '#e2a05a', deskVariant: 'dark', chairVariant: 'blue' },
  { carpet: '#777989', carpet2: '#686b7d', wall: { base: '#e8e6e8', trim: '#87818e', pattern: 'plain' }, accent: '#d48d61', deskVariant: 'wood', chairVariant: 'gray' },
  { carpet: '#806d65', carpet2: '#705d56', wall: { base: '#eee5dc', trim: '#a17b65', pattern: 'wood_panel' }, accent: '#d68a4d', deskVariant: 'wood', chairVariant: 'black' },
  { carpet: '#527b78', carpet2: '#466d6a', wall: { base: '#e0ece8', trim: '#5a8d85', pattern: 'stripes' }, accent: '#e0a34c', deskVariant: 'dark', chairVariant: 'green' },
  { carpet: '#646f7d', carpet2: '#555f6d', wall: { base: '#e2e7e8', trim: '#758491', pattern: 'brick' }, accent: '#e3ae4b', deskVariant: 'dark', chairVariant: 'black' },
  { carpet: '#796d75', carpet2: '#6a5e67', wall: { base: '#ece7e8', trim: '#947c87', pattern: 'stripes' }, accent: '#d88b62', deskVariant: 'wood', chairVariant: 'black' },
  { carpet: '#617c88', carpet2: '#536e7a', wall: { base: '#e3ecee', trim: '#718f98', pattern: 'wood_panel' }, accent: '#dba14e', deskVariant: 'dark', chairVariant: 'blue' },
  { carpet: '#746d60', carpet2: '#645d51', wall: { base: '#ece8df', trim: '#91816a', pattern: 'plain' }, accent: '#dc9149', deskVariant: 'wood', chairVariant: 'gray' },
];

export const THEME_COUNT = THEMES.length;

export function roomTheme(seed: number, mapTheme: MapThemeId = 'v1'): RoomTheme {
  const themes = mapTheme === 'v2' ? THEMES_V2 : THEMES;
  const n = themes.length;
  const t = themes[((Math.floor(seed) % n) + n) % n];
  return { ...t, wall: { ...t.wall } };
}
