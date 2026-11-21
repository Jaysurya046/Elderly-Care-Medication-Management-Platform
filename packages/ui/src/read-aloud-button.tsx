'use client';

import * as React from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { Button } from './button';

export interface ReadAloudButtonProps {
  textToRead: string;
  className?: string;
  label?: string;
}

export function ReadAloudButton({
  textToRead,
  className,
  label = 'Read details aloud',
}: ReadAloudButtonProps) {
  const [isSpeaking, setIsSpeaking] = React.useState(false);
  const [isSupported, setIsSupported] = React.useState(true);

  React.useEffect(() => {
    if (typeof window !== 'undefined' && !('speechSynthesis' in window)) {
      setIsSupported(false);
    }
  }, []);

  const handleSpeak = () => {
    if (!isSupported || typeof window === 'undefined') return;

    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(textToRead);
    utterance.rate = 0.9; // Slightly slower, clearer speech for older adults
    utterance.pitch = 1.0;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  };

  if (!isSupported) {
    return null; // Gracefully hide if Web Speech API is not supported
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="default"
      onClick={handleSpeak}
      className={className}
      aria-label={label}
      title={label}
    >
      {isSpeaking ? (
        <>
          <VolumeX className="w-5 h-5 mr-2 text-rose-600 animate-pulse" />
          <span>Stop reading</span>
        </>
      ) : (
        <>
          <Volume2 className="w-5 h-5 mr-2 text-blue-600" />
          <span>{label}</span>
        </>
      )}
    </Button>
  );
}
