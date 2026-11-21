import React, { useEffect, useState } from 'react';

/** Keep the one-second clock updates outside the accounting workspace. */
export function FooterClock() {
  const [time, setTime] = useState(() => new Date().toLocaleTimeString('en-US'));
  useEffect(() => {
    const timer = window.setInterval(() => setTime(new Date().toLocaleTimeString('en-US')), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return <span>{time}</span>;
}
