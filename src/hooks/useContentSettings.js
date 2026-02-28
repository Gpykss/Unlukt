import { useContext } from 'react';
import { ContentSettingsContext } from '../contexts/ContentSettingsContext';

export const useContentSettings = () => {
  const ctx = useContext(ContentSettingsContext);
  if (!ctx) throw new Error('useContentSettings must be used within ContentSettingsProvider');
  return ctx;
};
