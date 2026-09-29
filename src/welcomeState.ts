// Whether the welcome window was dismissed for good (per browser).
const KEY = 'spr-flow:welcome';
export const welcomeSeen = () => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
};
export const rememberWelcome = (seen: boolean) => {
  try {
    if (seen) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    // storage blocked: the window simply shows again next time
  }
};
