import type { PaletteMode } from '@mui/material/styles';

export interface ThemeOption {
  id: string;
  name: string;
  mode: PaletteMode;
  primary: string;
  secondary: string;
  background?: {
    default: string;
    paper: string;
  };
}

type ThemeDefinition = readonly [
  name: string,
  primary: string,
  secondary: string,
  background?: readonly [defaultColor: string, paperColor: string],
];

/**
 * Converts compact theme data into the shape consumed by MUI.
 *
 * Mode belongs to a group, while the optional background tuple is expanded in
 * one place. This keeps the catalogue data-only and prevents every entry from
 * repeating the same object structure.
 */
function defineThemeGroup(
  mode: PaletteMode,
  definitions: Record<string, ThemeDefinition>,
): ThemeOption[] {
  return Object.entries(definitions).map(([id, [name, primary, secondary, background]]) => ({
    id,
    name,
    mode,
    primary,
    secondary,
    ...(background ? { background: { default: background[0], paper: background[1] } } : undefined),
  }));
}

const darkThemes = defineThemeGroup('dark', {
  dark: ['Default Dark', '#2196f3', '#f50057'],
  cyberpunk: ['Cyberpunk', '#00ffff', '#ff00ff', ['#0a0e27', '#1a1f3a']],
  matrix: ['Matrix', '#00ff00', '#008000', ['#000000', '#0d1117']],
  neon: ['Neon', '#ff1744', '#00e5ff', ['#121212', '#1e1e1e']],
  dracula: ['Dracula', '#bd93f9', '#ff79c6', ['#282a36', '#44475a']],
  nord: ['Nord', '#88c0d0', '#81a1c1', ['#2e3440', '#3b4252']],
  monokai: ['Monokai', '#66d9ef', '#f92672', ['#272822', '#3e3d32']],
  solarized: ['Solarized Dark', '#268bd2', '#2aa198', ['#002b36', '#073642']],
  gruvbox: ['Gruvbox', '#fe8019', '#b8bb26', ['#282828', '#3c3836']],
  onedark: ['One Dark', '#61afef', '#c678dd', ['#282c34', '#21252b']],
  tokyonight: ['Tokyo Night', '#7aa2f7', '#bb9af7', ['#1a1b26', '#24283b']],
  catppuccin: ['Catppuccin', '#89b4fa', '#f5c2e7', ['#1e1e2e', '#313244']],
});

const lightThemes = defineThemeGroup('light', {
  light: ['Default Light', '#1976d2', '#dc004e'],
  mint: ['Mint', '#00bfa5', '#ff6d00', ['#f5f5f5', '#ffffff']],
  sakura: ['Sakura', '#ff4081', '#7c4dff', ['#fce4ec', '#ffffff']],
  ocean: ['Ocean', '#0288d1', '#26a69a', ['#e0f7fa', '#ffffff']],
  forest: ['Forest', '#4caf50', '#8bc34a', ['#e8f5e9', '#ffffff']],
  sunset: ['Sunset', '#ff6f00', '#ff3d00', ['#fff3e0', '#ffffff']],
});

const futuristicThemes = defineThemeGroup('dark', {
  evangelion: ['Evangelion', '#9c27b0', '#00e676', ['#1a0033', '#2d1b47']],
  akira: ['Akira', '#ff1744', '#ffffff', ['#000000', '#1a1a1a']],
  ghostshell: ['Ghost in Shell', '#00e5ff', '#e040fb', ['#0a0a0a', '#1c1c1c']],
  vaporwave: ['Vaporwave', '#ff6ec7', '#00f0ff', ['#120458', '#2d0b6b']],
});

export const themeOptions: ThemeOption[] = [...darkThemes, ...lightThemes, ...futuristicThemes];
