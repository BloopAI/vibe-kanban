import { useEffect, useState } from 'react';
import Icon from '@mdi/react';
import { mdiAnvil, mdiHammer } from '@mdi/js';

export function AnimatedAnvil({ className = '' }: { className?: string }) {
  const [isHammering, setIsHammering] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsHammering(true);
      setTimeout(() => setIsHammering(false), 300);
    }, 1800);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className={`relative w-10 h-10 ${className}`}>
      {/* Anvil Icon - positioned at bottom center */}
      <div 
        className="absolute bottom-0 left-1/2 transform -translate-x-1/3 transition-all duration-75"
        style={{
          transform: `translateX(-33%) ${isHammering ? 'scale(1.05) translateY(1px)' : 'scale(1)'}`,
          filter: isHammering ? 'brightness(1.15) drop-shadow(0 0 2px rgba(255, 255, 0, 0.3))' : 'brightness(1)'
        }}
      >
        <Icon path={mdiAnvil} size={1.4} className="text-foreground" />
      </div>
      
      {/* Hammer Icon - swinging down to strike anvil */}
      <div
        className="absolute transition-all duration-200 ease-in-out"
        style={{
          top: '-16px',
          left: '20%',
          transform: isHammering 
            ? 'translateX(-50%) rotate(70deg) scale(1.1)' 
            : 'translateX(-50%) rotate(-25deg) scale(1)',
          transformOrigin: '50% 100%',
          zIndex: 10
        }}
      >
        <Icon path={mdiHammer} size={1.2} className="text-muted-foreground drop-shadow-md" />
      </div>
      
      {/* Enhanced spark effects on impact */}
      {isHammering && (
        <>
          {/* Main impact sparks */}
          <div className="absolute top-4 left-4 w-1.5 h-1.5 bg-yellow-400 rounded-full animate-ping opacity-90" />
          <div className="absolute top-4.5 left-3.5 w-1 h-1 bg-orange-500 rounded-full animate-ping" 
               style={{ animationDelay: '40ms' }} />
          <div className="absolute top-4.5 left-5 w-1 h-1 bg-yellow-300 rounded-full animate-ping" 
               style={{ animationDelay: '80ms' }} />
          <div className="absolute top-5 left-4.5 w-0.5 h-0.5 bg-red-400 rounded-full animate-ping" 
               style={{ animationDelay: '120ms' }} />
          
          {/* Flying sparks */}
          <div className="absolute top-3 left-2 w-0.5 h-0.5 bg-yellow-400 rounded-full animate-bounce" 
               style={{ 
                 animationDuration: '0.25s',
                 transform: 'translateX(-8px) translateY(-6px)'
               }} />
          <div className="absolute top-3 left-7 w-0.5 h-0.5 bg-orange-500 rounded-full animate-bounce" 
               style={{ 
                 animationDuration: '0.3s',
                 animationDelay: '50ms',
                 transform: 'translateX(8px) translateY(-4px)'
               }} />
          <div className="absolute top-2.5 left-1 w-0.5 h-0.5 bg-yellow-300 rounded-full animate-bounce" 
               style={{ 
                 animationDuration: '0.2s',
                 animationDelay: '100ms',
                 transform: 'translateX(-12px) translateY(-8px)'
               }} />
          
          {/* Impact flash */}
          <div className="absolute top-4 left-3 w-4 h-2 bg-yellow-400 rounded-full opacity-25 animate-pulse blur-sm" 
               style={{ animationDuration: '0.3s' }} />
        </>
      )}
    </div>
  );
}