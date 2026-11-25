'use client';

import * as React from 'react';

export type SupportedLanguage = 'en' | 'es' | 'hi';

export interface TranslationDictionary {
  [key: string]: string;
}

const translations: Record<SupportedLanguage, TranslationDictionary> = {
  en: {
    'common.appName': 'Elder Care Platform',
    'common.loading': 'Loading...',
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.confirm': 'Confirm',
    'common.delete': 'Delete',
    'common.edit': 'Edit',
    'common.back': 'Back',
    'common.systemStatus': 'System Operational',
    'senior.takeDose': 'Take Medication',
    'senior.snooze': 'Snooze',
    'senior.skip': 'Skip Dose',
    'senior.nextDue': 'Next Scheduled Dose',
    'senior.emergencyCard': 'Emergency Medical Card',
    'senior.offlineNotice': 'You are currently offline. Your actions are saved and will sync automatically.',
    'dashboard.overview': 'Overview',
    'dashboard.medications': 'Medications',
    'dashboard.appointments': 'Appointments',
    'dashboard.notes': 'Care Notes',
    'dashboard.circle': 'Care Circle',
    'dashboard.audit': 'Security & Audit Log',
    'adherence.title': 'Medication Adherence',
    'adherence.sevenDay': '7-Day Adherence',
    'adherence.thirtyDay': '30-Day Adherence',
    'adherence.streak': 'Current Streak',
    'adherence.days': 'days',
    'adherence.patterns': 'Identified Patterns',
  },
  es: {
    'common.appName': 'Plataforma de Cuidado de Adultos Mayores',
    'common.loading': 'Cargando...',
    'common.save': 'Guardar',
    'common.cancel': 'Cancelar',
    'common.confirm': 'Confirmar',
    'common.delete': 'Eliminar',
    'common.edit': 'Editar',
    'common.back': 'Volver',
    'senior.takeDose': 'Tomar Medicamento',
    'senior.snooze': 'Posponer',
    'senior.skip': 'Omitir Dosis',
    'senior.nextDue': 'Próxima Dosis Programada',
    'senior.emergencyCard': 'Tarjeta Médica de Emergencia',
    'senior.offlineNotice': 'Está desconectado. Sus acciones se guardan y se sincronizarán automáticamente.',
    'dashboard.overview': 'Resumen',
    'dashboard.medications': 'Medicamentos',
    'dashboard.appointments': 'Citas Médicas',
    'dashboard.notes': 'Notas de Cuidado',
    'dashboard.circle': 'Círculo de Cuidado',
    'dashboard.audit': 'Registro de Auditoría',
    'adherence.title': 'Adherencia al Tratamiento',
    'adherence.sevenDay': 'Adherencia (7 días)',
    'adherence.thirtyDay': 'Adherencia (30 días)',
    'adherence.streak': 'Racha Actual',
    'adherence.days': 'días',
    'adherence.patterns': 'Patrones Identificados',
  },
  hi: {
    'common.appName': 'बुजुर्ग देखभाल मंच',
    'common.loading': 'लोड हो रहा है...',
    'common.save': 'सहेजें',
    'common.cancel': 'रद्द करें',
    'common.confirm': 'पुष्टि करें',
    'common.delete': 'हटाएं',
    'common.edit': 'संपादित करें',
    'common.back': 'पीछे जाएं',
    'senior.takeDose': 'दवा लें',
    'senior.snooze': 'बाद में याद दिलाएं',
    'senior.skip': 'दवा छोड़ें',
    'senior.nextDue': 'अगली निर्धारित खुराक',
    'senior.emergencyCard': 'आपातकालीन मेडिकल कार्ड',
    'senior.offlineNotice': 'आप वर्तमान में ऑफ़लाइन हैं। आपके कार्य सुरक्षित हैं और स्वतः सिंक हो जाएंगे।',
    'dashboard.overview': 'अवलोकन',
    'dashboard.medications': 'दवाइयां',
    'dashboard.appointments': 'डॉक्टर अपॉइंटमेंट्स',
    'dashboard.notes': 'देखभाल टिप्पणियां',
    'dashboard.circle': 'केयर सर्कल',
    'dashboard.audit': 'सुरक्षा और ऑडिट लॉग',
    'adherence.title': 'दवा सेवन नियमितता',
    'adherence.sevenDay': '7-दिवसीय नियमितता',
    'adherence.thirtyDay': '30-दिवसीय नियमितता',
    'adherence.streak': 'लगातार दिन',
    'adherence.days': 'दिन',
    'adherence.patterns': 'पहचाने गए पैटर्न',
  },
};

export function getTranslation(lang: SupportedLanguage, key: string): string {
  const dict = translations[lang] || translations.en;
  if (dict[key]) {
    return dict[key];
  }
  return translations.en[key] || key;
}

interface LanguageContextType {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  t: (key: string) => string;
}

const LanguageContext = React.createContext<LanguageContextType>({
  language: 'en',
  setLanguage: () => {},
  t: (key: string) => getTranslation('en', key),
});

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = React.useState<SupportedLanguage>('en');

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('eldercare_language') as SupportedLanguage;
      if (saved && (saved === 'en' || saved === 'es' || saved === 'hi')) {
        setLanguageState(saved);
      }
    }
  }, []);

  const setLanguage = (lang: SupportedLanguage) => {
    setLanguageState(lang);
    if (typeof window !== 'undefined') {
      localStorage.setItem('eldercare_language', lang);
    }
  };

  const t = (key: string) => getTranslation(language, key);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useTranslation = () => React.useContext(LanguageContext);

export const LanguageSelector: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { language, setLanguage } = useTranslation();

  return (
    <div className={`inline-flex items-center space-x-1 ${className}`}>
      <label htmlFor="language-select" className="sr-only">
        Language
      </label>
      <select
        id="language-select"
        value={language}
        onChange={(e) => setLanguage(e.target.value as SupportedLanguage)}
        className="text-xs font-semibold bg-white border border-slate-300 rounded-lg py-1 px-2 text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="en">English (US)</option>
        <option value="es">Español</option>
        <option value="hi">हिन्दी</option>
      </select>
    </div>
  );
};
