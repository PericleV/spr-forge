// The Mantine components' context for the whole app: the theme from the app's colours, light or dark as the app.
import { MantineProvider } from '@mantine/core';
import type { ReactNode } from 'react';
import { resolver, theme, useScheme } from './theme.ts';
import './mantine.css';

export function UiProvider({ children }: { children: ReactNode }) {
  const scheme = useScheme();
  return (
    <MantineProvider theme={theme} cssVariablesResolver={resolver} forceColorScheme={scheme}>
      {children}
    </MantineProvider>
  );
}
