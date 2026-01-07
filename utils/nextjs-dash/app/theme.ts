'use client';

import { createTheme, PaletteMode } from '@mui/material/styles';

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

export const themeOptions: ThemeOption[] = [
  // Dark Themes
  { id: 'dark', name: 'Default Dark', mode: 'dark', primary: '#2196f3', secondary: '#f50057' },
  { id: 'cyberpunk', name: 'Cyberpunk', mode: 'dark', primary: '#00ffff', secondary: '#ff00ff', background: { default: '#0a0e27', paper: '#1a1f3a' } },
  { id: 'matrix', name: 'Matrix', mode: 'dark', primary: '#00ff00', secondary: '#008000', background: { default: '#000000', paper: '#0d1117' } },
  { id: 'neon', name: 'Neon', mode: 'dark', primary: '#ff1744', secondary: '#00e5ff', background: { default: '#121212', paper: '#1e1e1e' } },
  { id: 'dracula', name: 'Dracula', mode: 'dark', primary: '#bd93f9', secondary: '#ff79c6', background: { default: '#282a36', paper: '#44475a' } },
  { id: 'nord', name: 'Nord', mode: 'dark', primary: '#88c0d0', secondary: '#81a1c1', background: { default: '#2e3440', paper: '#3b4252' } },
  { id: 'monokai', name: 'Monokai', mode: 'dark', primary: '#66d9ef', secondary: '#f92672', background: { default: '#272822', paper: '#3e3d32' } },
  { id: 'solarized', name: 'Solarized Dark', mode: 'dark', primary: '#268bd2', secondary: '#2aa198', background: { default: '#002b36', paper: '#073642' } },
  { id: 'gruvbox', name: 'Gruvbox', mode: 'dark', primary: '#fe8019', secondary: '#b8bb26', background: { default: '#282828', paper: '#3c3836' } },
  { id: 'onedark', name: 'One Dark', mode: 'dark', primary: '#61afef', secondary: '#c678dd', background: { default: '#282c34', paper: '#21252b' } },
  { id: 'tokyonight', name: 'Tokyo Night', mode: 'dark', primary: '#7aa2f7', secondary: '#bb9af7', background: { default: '#1a1b26', paper: '#24283b' } },
  { id: 'catppuccin', name: 'Catppuccin', mode: 'dark', primary: '#89b4fa', secondary: '#f5c2e7', background: { default: '#1e1e2e', paper: '#313244' } },
  
  // Light Themes
  { id: 'light', name: 'Default Light', mode: 'light', primary: '#1976d2', secondary: '#dc004e' },
  { id: 'mint', name: 'Mint', mode: 'light', primary: '#00bfa5', secondary: '#ff6d00', background: { default: '#f5f5f5', paper: '#ffffff' } },
  { id: 'sakura', name: 'Sakura', mode: 'light', primary: '#ff4081', secondary: '#7c4dff', background: { default: '#fce4ec', paper: '#ffffff' } },
  { id: 'ocean', name: 'Ocean', mode: 'light', primary: '#0288d1', secondary: '#26a69a', background: { default: '#e0f7fa', paper: '#ffffff' } },
  { id: 'forest', name: 'Forest', mode: 'light', primary: '#4caf50', secondary: '#8bc34a', background: { default: '#e8f5e9', paper: '#ffffff' } },
  { id: 'sunset', name: 'Sunset', mode: 'light', primary: '#ff6f00', secondary: '#ff3d00', background: { default: '#fff3e0', paper: '#ffffff' } },
  
  // Anime/Futuristic Themes
  { id: 'evangelion', name: 'Evangelion', mode: 'dark', primary: '#9c27b0', secondary: '#00e676', background: { default: '#1a0033', paper: '#2d1b47' } },
  { id: 'akira', name: 'Akira', mode: 'dark', primary: '#ff1744', secondary: '#ffffff', background: { default: '#000000', paper: '#1a1a1a' } },
  { id: 'ghostshell', name: 'Ghost in Shell', mode: 'dark', primary: '#00e5ff', secondary: '#e040fb', background: { default: '#0a0a0a', paper: '#1c1c1c' } },
  { id: 'vaporwave', name: 'Vaporwave', mode: 'dark', primary: '#ff6ec7', secondary: '#00f0ff', background: { default: '#120458', paper: '#2d0b6b' } },
];

export function createCustomTheme(themeId: string) {
  const option = themeOptions.find(t => t.id === themeId) || themeOptions[0];
  
  return createTheme({
    palette: {
      mode: option.mode,
      primary: {
        main: option.primary,
      },
      secondary: {
        main: option.secondary,
      },
      background: option.background || {
        default: option.mode === 'dark' ? '#0a1929' : '#ffffff',
        paper: option.mode === 'dark' ? '#132f4c' : '#f5f5f5',
      },
    },
    typography: {
      fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
      h4: {
        fontWeight: 600,
      },
      h5: {
        fontWeight: 600,
      },
      h6: {
        fontWeight: 500,
      },
    },
    components: {
      MuiCard: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            transition: 'transform 0.3s ease-in-out, box-shadow 0.3s ease-in-out',
            '&:hover': {
              transform: 'translateY(-4px)',
              boxShadow: option.mode === 'dark' 
                ? '0 8px 24px rgba(0, 0, 0, 0.4)' 
                : '0 8px 24px rgba(0, 0, 0, 0.15)',
            },
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            transition: 'all 0.3s ease-in-out',
            '&:hover': {
              transform: 'scale(1.05)',
            },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            fontWeight: 500,
            transition: 'all 0.2s ease-in-out',
            '&:hover': {
              transform: 'scale(1.1)',
            },
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            transition: 'all 0.2s ease-in-out',
            '&:hover': {
              transform: 'rotate(15deg) scale(1.1)',
            },
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            transition: 'box-shadow 0.3s ease-in-out',
          },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            transition: 'all 0.3s ease-in-out',
            '&:hover': {
              transform: 'translateY(-2px)',
            },
          },
        },
      },
    },
    transitions: {
      duration: {
        shortest: 150,
        shorter: 200,
        short: 250,
        standard: 300,
        complex: 375,
        enteringScreen: 225,
        leavingScreen: 195,
      },
      easing: {
        easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
        easeOut: 'cubic-bezier(0.0, 0, 0.2, 1)',
        easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
        sharp: 'cubic-bezier(0.4, 0, 0.6, 1)',
      },
    },
  });
}

// Export default theme for initial load
const defaultTheme = createCustomTheme('dark');
export default defaultTheme;
