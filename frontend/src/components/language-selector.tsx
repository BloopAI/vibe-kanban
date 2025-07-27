import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTranslation, LANGUAGE_LABELS, type Language } from '@/lib/i18n';

export function LanguageSelector() {
  const { currentLanguage, setLanguage } = useTranslation();

  return (
    <Select value={currentLanguage} onValueChange={(value: Language) => setLanguage(value)}>
      <SelectTrigger className="w-[140px]">
        <SelectValue placeholder="Language" />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(LANGUAGE_LABELS).map(([code, label]) => (
          <SelectItem key={code} value={code}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}