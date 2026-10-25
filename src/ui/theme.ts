// The look of the Mantine components, from the app's own colours (index.css): the same panel, text, border and accent
// (the one chosen in the top bar), in the light and the dark theme; compact sizes, as the rest of the app: the text of
// the controls 12 px, their corners 6 px, their height 26 px (App.css), as the app's own controls.
import { createTheme, type CSSVariablesResolver, type MantineColorsTuple } from '@mantine/core';
import { useSyncExternalStore } from 'react';

// a stand-in for the accent where Mantine needs ten shades (the filled and light colours are taken from --accent)
const accent: MantineColorsTuple = ['#e6fbf8', '#cdf5ef', '#9cebe0', '#67e0d0', '#3dd7c3', '#22d0bb', '#14b8a6', '#0b9f8f', '#008e7f', '#007b6d'];

// the layer of the popups (lists, tooltips): over the panels and the app's own menus
const LAYER = 3000;

export const theme = createTheme({
  primaryColor: 'accent',
  colors: { accent },
  fontFamily: "system-ui, 'Segoe UI', Roboto, sans-serif",
  fontFamilyMonospace: "ui-monospace, Consolas, 'Cascadia Mono', monospace",
  fontSizes: { xs: '12px', sm: '12px', md: '13px', lg: '14px', xl: '15px' },
  radius: { xs: '4px', sm: '6px', md: '6px', lg: '8px', xl: '12px' },
  defaultRadius: 'sm',
  focusRing: 'auto',
  cursorType: 'pointer',
  components: {
    Button: { defaultProps: { size: 'xs' } },
    ActionIcon: { defaultProps: { size: 'md', variant: 'subtle', color: 'gray' } },
    TextInput: { defaultProps: { size: 'xs' } },
    NumberInput: { defaultProps: { size: 'xs' } },
    Select: { defaultProps: { size: 'xs', allowDeselect: false, comboboxProps: { withinPortal: true, zIndex: LAYER } } },
    SegmentedControl: { defaultProps: { size: 'xs' } },
    Switch: { defaultProps: { size: 'xs' } },
    Checkbox: { defaultProps: { size: 'xs' } },
    Tooltip: { defaultProps: { openDelay: 400, withArrow: true, multiline: true, maw: 260, fz: 'xs', zIndex: LAYER + 10 } },
    Popover: { defaultProps: { shadow: 'md', withinPortal: true, zIndex: LAYER } },
  },
});

const ours = {
  '--mantine-color-body': 'var(--panel)',
  '--mantine-color-text': 'var(--text)',
  '--mantine-color-dimmed': 'var(--muted)',
  '--mantine-color-placeholder': 'var(--muted)',
  '--mantine-color-default': 'var(--input)',
  '--mantine-color-default-hover': 'color-mix(in srgb, var(--accent) 8%, var(--input))',
  '--mantine-color-default-color': 'var(--text)',
  '--mantine-color-default-border': 'var(--border)',
  '--mantine-primary-color-filled': 'var(--accent)',
  '--mantine-primary-color-filled-hover': 'color-mix(in srgb, var(--accent) 85%, var(--text))',
  '--mantine-primary-color-light': 'color-mix(in srgb, var(--accent) 14%, transparent)',
  '--mantine-primary-color-light-hover': 'color-mix(in srgb, var(--accent) 22%, transparent)',
  '--mantine-primary-color-light-color': 'color-mix(in srgb, var(--accent) 75%, var(--text))',
  '--mantine-primary-color-contrast': 'var(--on-accent)',
  '--mantine-color-accent-filled': 'var(--accent)',
  '--mantine-color-accent-light': 'color-mix(in srgb, var(--accent) 14%, transparent)',
  '--mantine-color-accent-light-color': 'color-mix(in srgb, var(--accent) 75%, var(--text))',
};
export const resolver: CSSVariablesResolver = () => ({ variables: {}, light: ours, dark: ours });

// The scheme the app shows: forced by the top bar (data-theme on <html>), else the system's.
const dark = () => {
  const t = document.documentElement.dataset.theme;
  return t === 'dark' || (t !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
};
const subscribe = (f: () => void) => {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const mo = new MutationObserver(f);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  mq.addEventListener('change', f);
  return () => (mo.disconnect(), mq.removeEventListener('change', f));
};
export const useScheme = (): 'light' | 'dark' => (useSyncExternalStore(subscribe, dark) ? 'dark' : 'light');
