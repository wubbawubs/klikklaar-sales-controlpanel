import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';

const QUOTES = [
  { text: "Go crush it today! 💪", author: null },
  { text: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill" },
  { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
  { text: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson" },
  { text: "Every morning brings new potential, but if you dwell on the misfortunes of the day before, you tend to overlook tremendous opportunities.", author: "Harvey Mackay" },
  { text: "Hustle in silence, let success make the noise.", author: null },
  { text: "Your limitation, it's only your imagination.", author: null },
  { text: "The harder you work for something, the greater you'll feel when you achieve it.", author: null },
  { text: "Dream it. Wish it. Do it.", author: null },
  { text: "It always seems impossible until it's done.", author: "Nelson Mandela" },
  { text: "Act as if what you do makes a difference. It does.", author: "William James" },
  { text: "What you do today can improve all your tomorrows.", author: "Ralph Marston" },
];

function getRandomQuote() {
  return QUOTES[Math.floor(Math.random() * QUOTES.length)];
}

interface MotivationalSplashProps {
  onComplete: () => void;
}

export function MotivationalSplash({ onComplete }: MotivationalSplashProps) {
  const [quote] = useState(getRandomQuote);
  const [phase, setPhase] = useState<'enter' | 'visible' | 'exit'>('enter');

  useEffect(() => {
    const enterTimer = setTimeout(() => setPhase('visible'), 50);
    const exitTimer = setTimeout(() => setPhase('exit'), 2800);
    const doneTimer = setTimeout(() => onComplete(), 3400);

    return () => {
      clearTimeout(enterTimer);
      clearTimeout(exitTimer);
      clearTimeout(doneTimer);
    };
  }, [onComplete]);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-background transition-opacity duration-500 ${
        phase === 'exit' ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {/* Animated background glow */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/5 blur-3xl animate-pulse" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-primary/10 blur-2xl animate-pulse" style={{ animationDelay: '0.5s' }} />
      </div>

      <div
        className={`relative max-w-lg mx-auto px-8 text-center transition-all duration-700 ease-out ${
          phase === 'enter'
            ? 'opacity-0 scale-95 translate-y-4'
            : phase === 'exit'
            ? 'opacity-0 scale-105 -translate-y-4'
            : 'opacity-100 scale-100 translate-y-0'
        }`}
      >
        <div className="mb-6 flex justify-center">
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Sparkles className="h-6 w-6 text-primary animate-pulse" />
          </div>
        </div>

        <blockquote className="text-2xl md:text-3xl font-bold text-foreground leading-snug tracking-tight">
          "{quote.text}"
        </blockquote>

        {quote.author && (
          <p className="mt-4 text-sm text-muted-foreground font-medium tracking-wide uppercase">
            — {quote.author}
          </p>
        )}

        <div className="mt-8 flex justify-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="block h-1.5 w-1.5 rounded-full bg-primary/40 animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
