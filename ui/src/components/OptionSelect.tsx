import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.js';

export interface OptionItem {
  label: string;
  value: string;
}

interface OptionSelectProps {
  id?: string;
  value: string;
  items: OptionItem[];
  disabled?: boolean;
  onValueChange: (value: string) => void;
}

export const OptionSelect: React.FC<OptionSelectProps> = ({
  id,
  value,
  items,
  disabled,
  onValueChange,
}) => {
  return (
    <Select
      items={items}
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        if (next) onValueChange(next);
      }}
    >
      <SelectTrigger id={id} size="sm" className="w-full min-w-0">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
};
