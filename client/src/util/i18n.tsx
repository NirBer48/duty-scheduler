import React, { createContext, useContext, useMemo, useState, ReactNode } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

type Language = 'en' | 'he';
type TranslationMap = Record<string, string>;
const translations: Record<Language, TranslationMap> = {
  en: {
    'Duty Scheduler': 'Duty Scheduler',
    'People': 'People',
    'Add': 'Add',
    'Posts': 'Posts',
    'Scheduler': 'Scheduler',
    'Start': 'Start',
    'Days': 'Days',
    'Generate': 'Generate',
    'Name': 'Name',
    'Required per shift': 'Required per shift',
    'Shift': 'Shift',
    'not enough manpower': 'Not enough manpower',
    'Delete': 'Delete',
    'Gender': 'Gender',
    'Same gender only': 'Same gender only',
    'End': 'End',
    'Import': 'Import',
    'Name cannot be empty': 'Name cannot be empty',
    'Name already exists': 'Name already exists',
    'Edit Shift': 'Edit Shift',
    'Cancel': 'Cancel',
    'Save': 'Save',
    'Selected': 'Selected',
    'Save Schedule': 'Save Schedule',
    'Export to CSV': 'Export to CSV',
    'Export to Excel': 'Export to Excel',
    'Schedule': 'Schedule',
    'Unsaved changes': 'Unsaved changes',
    'Schedule is invalid': 'Schedule is invalid',
    'needs': 'needs',
    'has': 'has',
    'and': 'and',
    'more errors': 'more errors',
    'Search people': 'Search people',
    'Save failed': 'Save failed',
    'Day': 'Day',
    'Rest violation': 'Rest violation',
    'Rest violation between': 'Rest violation between',
    'Requires same gender partner': 'Requires same gender partner',
    'requires same gender': 'requires same gender',
    'requires same gender partner': 'requires same gender partner',
    'Shift Settings': 'Shift Settings',
    'No people added yet': 'No people added yet',
    'No posts added yet': 'No posts added yet',
    'Required': 'Required',
    'Edit ES Group': 'Edit ES Group',
    'Total people needed': 'Total people needed',
    'Active per shift': 'Active per shift',
    'rest are resting': 'rest are resting',
    'Active': 'Active',
    'Resting': 'Resting',
    'already in shift': 'already in shift',
    'already selected': 'already selected',
    'max': 'max',
    'active': 'active',
    'Imported': 'Imported',
    'Skipped': 'Skipped',
    'Import failed': 'Import failed',
    'Clear': 'Clear',
    'Are you sure you want to clear the schedule?': 'Are you sure you want to clear the schedule?',
    'Limited ability (LT)': 'Limited ability (LT)',
    'Limited ability note': 'People marked as limited ability (LT) cannot be assigned to ES groups.',
    'Limited ability note short': 'Limited ability (LT)',
    'Shifts': 'Shifts',
    'Hours': 'Hours',
    'BW Assignments': 'BW Assignments',
    'BW Slot': 'BW Slot',
    'Edit BW Slot': 'Edit BW Slot',
    'Required per slot': 'Required per slot',
    'Overlapping shift in this timeframe': 'Overlapping shift in this timeframe',
    'ES limit reached for this slot': 'ES limit reached for this slot',
    'ES overlap with shift': 'Another ES member is already on shift at this time',
  },
  he: {
    'Duty Scheduler': 'סידור תורנויות',
    'People': 'אנשים',
    'Add': 'הוסף',
    'Posts': 'עמדות',
    'Scheduler': 'קביעת משמרות',
    'Start': 'התחלה',
    'Days': 'ימים',
    'Generate': 'צור לוח',
    'Name': 'שם',
    'Required per shift': 'נדרשים למשמרת',
    'Shift': 'משמרת',
    'not enough manpower': 'אין מספיק כוח אדם',
    'Delete': 'מחק',
    'Gender': 'מגדר',
    'Same gender only': 'מעדיף בן/בת אותו מגדר',
    'End': 'סיום',
    'Import': 'ייבוא',
    'Name cannot be empty': 'השם לא יכול להיות ריק',
    'Name already exists': 'השם כבר קיים',
    'Edit Shift': 'עריכת משמרת',
    'Cancel': 'ביטול',
    'Save': 'שמור',
    'Selected': 'נבחרו',
    'Save Schedule': 'שמור סידור',
    'Export to CSV': 'ייצוא ל-CSV',
    'Export to Excel': 'ייצוא לאקסל',
    'Schedule': 'סידור',
    'Unsaved changes': 'יש שינויים שלא נשמרו',
    'Schedule is invalid': 'הסידור לא תקין',
    'needs': 'צריך',
    'has': 'יש',
    'and': 'ועוד',
    'more errors': 'שגיאות נוספות',
    'Search people': 'חיפוש אנשים',
    'Save failed': 'השמירה נכשלה',
    'Day': 'יום',
    'Rest violation': 'הפרת מנוחה',
    'Rest violation between': 'הפרת מנוחה בין',
    'Requires same gender partner': 'דורש שותף מאותו מגדר',
    'requires same gender': 'דורש אותו מגדר',
    'requires same gender partner': 'דורש שותף מאותו מגדר',
    'Shift Settings': 'הגדרות משמרת',
    'No people added yet': 'עדיין לא נוספו אנשים',
    'No posts added yet': 'עדיין לא נוספו עמדות',
    'Required': 'נדרשים',
    'Edit ES Group': "עריכת קבוצת כ\"כ",
    'Total people needed': 'סה"כ אנשים נדרשים',
    'Active per shift': 'פעילים במשמרת',
    'rest are resting': 'השאר במנוחה',
    'Active': 'פעילים',
    'Resting': 'במנוחה',
    'already in shift': 'כבר במשמרת',
    'already selected': 'כבר נבחר',
    'max': 'מקסימום',
    'active': 'פעילים',
    'Imported': 'יובאו',
    'Skipped': 'דולגו',
    'Import failed': 'הייבוא נכשל',
    'Clear': 'נקה',
    'Are you sure you want to clear the schedule?': 'האם אתה בטוח שברצונך לנקות את הסידור?',
    'Limited ability (LT)': 'כ"מ (LT)',
    'Limited ability note': 'אנשים המסומנים ככ"מ אינם יכולים להיבחר לכ"כ.',
    'Limited ability note short': 'כ"מ',
    'Shifts': 'משמרות',
    'Hours': 'שעות',
    'BW Assignments': 'עב"ס',
    'BW Slot': 'שורת עב"ס',
    'Edit BW Slot': 'עריכת עב"ס',
    'Required per slot': 'נדרשים לשורה',
    'Overlapping shift in this timeframe': 'משמרת חופפת בזמן זה',
    'ES limit reached for this slot': 'כבר נבחר כ"כ לשורה זו',
    'ES overlap with shift': 'חבר כ"כ אחר כבר במשמרת בזמן זה',
  }
};

type I18nContextValue = {
  lang: Language;
  rtl: boolean;
  setLang: (lang: Language) => void;
  t: (key: string) => string;
};

const I18nContext = createContext<I18nContextValue>({
  lang: 'he',
  rtl: true,
  setLang: () => {},
  t: (k) => k
});

export const I18nProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [lang, setLang] = useState<Language>('he');
  const rtl = lang === 'he';
  const theme = useMemo(() => createTheme({ direction: rtl ? 'rtl' : 'ltr' }), [rtl]);
  const t = (k: string) => translations[lang][k] || k;

  return (
    <I18nContext.Provider value={{ lang, rtl, setLang, t }}>
      <ThemeProvider theme={theme}>
        <div dir={rtl ? 'rtl' : 'ltr'} style={{ width: '100%' }}>
          {children}
        </div>
      </ThemeProvider>
    </I18nContext.Provider>
  );
};

export const useI18n = () => useContext(I18nContext);
