import { BANK_LOGOS } from '../assets';

type Props = {
  bank: string;
  size?: number;
};

export function BankLogoName({ bank, size = 24 }: Props) {
  const hasLogo = bank in BANK_LOGOS;
  
  return (
    <div className="flex items-center gap-2">
      {hasLogo ? (
        <img 
          src={BANK_LOGOS[bank]} 
          alt={bank} 
          className="rounded"
          style={{ width: size, height: size }}
        />
      ) : (
        <div 
          className="bg-slate-700 rounded flex items-center justify-center text-xs font-bold uppercase"
          style={{ width: size, height: size }}
        >
          {bank.slice(0, 2)}
        </div>
      )}
    </div>
  );
}