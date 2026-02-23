import { useState, useEffect } from 'react';

const fullText = 'MESSIGN';

export function AnimatedLogo() {
  const [displayText, setDisplayText] = useState('');
  const [showCursor, setShowCursor] = useState(true);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    let currentIndex = 0;
    const typingInterval = setInterval(() => {
      if (currentIndex <= fullText.length) {
        setDisplayText(fullText.slice(0, currentIndex));
        currentIndex++;
      } else {
        clearInterval(typingInterval);
        setIsComplete(true);
      }
    }, 150);

    const cursorInterval = setInterval(() => {
      setShowCursor((prev) => !prev);
    }, 500);

    return () => {
      clearInterval(typingInterval);
      clearInterval(cursorInterval);
    };
  }, []);

  return (
    <div className="flex flex-col items-center mb-8">
      <div className="relative mb-4">
        <div
          className={`
            w-20 h-20 rounded-2xl flex items-center justify-center
            bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600
            shadow-lg transform transition-all duration-500
            ${isComplete ? 'animate-pulse-glow' : ''}
          `}
          style={{
            boxShadow: isComplete
              ? '0 0 40px rgba(59, 130, 246, 0.6), 0 0 80px rgba(99, 102, 241, 0.4)'
              : '0 10px 40px rgba(59, 130, 246, 0.3)',
          }}
        >
          <span className="text-4xl font-bold text-white">M</span>
        </div>
        <div className="absolute inset-0 animate-spin-slow pointer-events-none">
          <div className="absolute -top-1 left-1/2 w-2 h-2 bg-blue-400 rounded-full animate-pulse -translate-x-1/2" />
        </div>
        <div className="absolute inset-0 animate-spin-reverse pointer-events-none">
          <div className="absolute -bottom-1 left-1/2 w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse -translate-x-1/2" />
        </div>
      </div>

      <div className="relative">
        <h1 className="text-4xl md:text-5xl font-bold tracking-wider">
          <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
            {displayText}
          </span>
          <span
            className={`
              inline-block w-0.5 h-10 ml-1 bg-blue-500 align-middle
              ${showCursor ? 'opacity-100' : 'opacity-0'}
              transition-opacity duration-100
            `}
          />
        </h1>
        <div
          className="h-1 mt-2 rounded-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 transition-all duration-500 ease-out"
          style={{
            width: `${(displayText.length / fullText.length) * 100}%`,
            boxShadow: '0 0 20px rgba(59, 130, 246, 0.8)',
          }}
        />
      </div>

      <p
        className={`
          mt-4 text-gray-500 text-lg tracking-wide
          transition-all duration-1000 delay-500
          ${isComplete ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}
        `}
      >
        Enterprise Communication Platform
      </p>
    </div>
  );
}
