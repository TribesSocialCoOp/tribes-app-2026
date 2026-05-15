"use client";

import React from 'react';

/**
 * NFC/Bond Tap Animation — pure CSS/SVG.
 *
 * Three visual states:
 * - sending:  Purple phones, outward ripple pulse — "I'm broadcasting"
 * - waiting:  Muted tones, slower pulse — "I'm ready to receive"
 * - success:  Green burst, phones converge — "Bond exchanged!"
 */

type AnimationState = 'sending' | 'waiting' | 'success';

interface NfcTapAnimationProps {
  state: AnimationState;
  className?: string;
}

export function NfcTapAnimation({ state, className = '' }: NfcTapAnimationProps) {
  return (
    <div className={`nfc-tap-animation nfc-tap-${state} ${className}`}>
      <div className="nfc-phone nfc-phone-left" />
      <div className="nfc-phone nfc-phone-right" />
      <div className="nfc-ripple-container">
        <div className="nfc-ripple" />
        <div className="nfc-ripple" />
        <div className="nfc-ripple" />
      </div>
      <div className="nfc-center-dot">
        {state === 'success' && <span className="nfc-check">✓</span>}
      </div>

      <style jsx>{`
        .nfc-tap-animation {
          position: relative;
          width: 240px;
          height: 180px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto;
        }

        /* Phone silhouettes */
        .nfc-phone {
          position: absolute;
          width: 52px;
          height: 88px;
          border: 2.5px solid rgba(167, 139, 250, 0.6);
          border-radius: 12px;
          background: rgba(167, 139, 250, 0.05);
          transition: all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .nfc-phone::after {
          content: '';
          position: absolute;
          bottom: 6px;
          left: 50%;
          transform: translateX(-50%);
          width: 14px;
          height: 3px;
          border-radius: 2px;
          background: rgba(167, 139, 250, 0.4);
        }
        .nfc-phone::before {
          content: '';
          position: absolute;
          top: 6px;
          left: 50%;
          transform: translateX(-50%);
          width: 18px;
          height: 3px;
          border-radius: 2px;
          background: rgba(167, 139, 250, 0.2);
        }

        .nfc-phone-left {
          left: 40px;
          transform: rotate(-12deg);
          animation: nfc-float-left 3s ease-in-out infinite;
        }
        .nfc-phone-right {
          right: 40px;
          transform: rotate(12deg);
          animation: nfc-float-right 3s ease-in-out infinite;
        }

        /* Ripple rings */
        .nfc-ripple-container {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
        }
        .nfc-ripple {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          border-radius: 50%;
          border: 2px solid rgba(167, 139, 250, 0.4);
          animation: nfc-ripple-expand 2.4s ease-out infinite;
        }
        .nfc-ripple:nth-child(1) { animation-delay: 0s; }
        .nfc-ripple:nth-child(2) { animation-delay: 0.6s; }
        .nfc-ripple:nth-child(3) { animation-delay: 1.2s; }

        /* Center dot */
        .nfc-center-dot {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #a78bfa;
          box-shadow: 0 0 20px rgba(167, 139, 250, 0.6);
          animation: nfc-dot-pulse 2s ease-in-out infinite;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .nfc-check {
          font-size: 8px;
          color: #0a0a0a;
          font-weight: 900;
          line-height: 1;
        }

        /* === SENDING state === */
        .nfc-tap-sending .nfc-phone-left {
          border-color: rgba(167, 139, 250, 0.9);
          background: rgba(167, 139, 250, 0.1);
        }

        /* === WAITING state === */
        .nfc-tap-waiting .nfc-phone {
          border-color: rgba(100, 116, 139, 0.5);
          background: rgba(100, 116, 139, 0.05);
        }
        .nfc-tap-waiting .nfc-phone::after {
          background: rgba(100, 116, 139, 0.3);
        }
        .nfc-tap-waiting .nfc-phone::before {
          background: rgba(100, 116, 139, 0.15);
        }
        .nfc-tap-waiting .nfc-phone-right {
          border-color: rgba(167, 139, 250, 0.7);
          background: rgba(167, 139, 250, 0.08);
        }
        .nfc-tap-waiting .nfc-phone-right::after {
          background: rgba(167, 139, 250, 0.4);
        }
        .nfc-tap-waiting .nfc-ripple {
          border-color: rgba(100, 116, 139, 0.3);
          animation-direction: reverse;
        }
        .nfc-tap-waiting .nfc-center-dot {
          background: #64748b;
          box-shadow: 0 0 15px rgba(100, 116, 139, 0.4);
          animation: nfc-dot-pulse-slow 3s ease-in-out infinite;
        }

        /* === SUCCESS state === */
        .nfc-tap-success .nfc-phone-left {
          animation: none;
          left: 62px;
          transform: rotate(-4deg);
          border-color: rgba(74, 222, 128, 0.9);
          background: rgba(74, 222, 128, 0.1);
        }
        .nfc-tap-success .nfc-phone-right {
          animation: none;
          right: 62px;
          transform: rotate(4deg);
          border-color: rgba(74, 222, 128, 0.9);
          background: rgba(74, 222, 128, 0.1);
        }
        .nfc-tap-success .nfc-phone::after {
          background: rgba(74, 222, 128, 0.5);
        }
        .nfc-tap-success .nfc-ripple {
          border-color: rgba(74, 222, 128, 0.5);
          animation: nfc-ripple-burst 1.2s ease-out infinite;
        }
        .nfc-tap-success .nfc-center-dot {
          background: #4ade80;
          box-shadow: 0 0 30px rgba(74, 222, 128, 0.8);
          width: 14px;
          height: 14px;
          animation: nfc-dot-success 0.6s ease-out;
        }

        /* === KEYFRAMES === */
        @keyframes nfc-float-left {
          0%, 100% { transform: rotate(-12deg) translateY(0); }
          50% { transform: rotate(-10deg) translateY(-6px) translateX(4px); }
        }
        @keyframes nfc-float-right {
          0%, 100% { transform: rotate(12deg) translateY(0); }
          50% { transform: rotate(10deg) translateY(-6px) translateX(-4px); }
        }
        @keyframes nfc-ripple-expand {
          0% { width: 12px; height: 12px; opacity: 0.8; }
          100% { width: 100px; height: 100px; opacity: 0; }
        }
        @keyframes nfc-ripple-burst {
          0% { width: 12px; height: 12px; opacity: 1; }
          100% { width: 140px; height: 140px; opacity: 0; }
        }
        @keyframes nfc-dot-pulse {
          0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
          50% { transform: translate(-50%, -50%) scale(1.4); opacity: 0.7; }
        }
        @keyframes nfc-dot-pulse-slow {
          0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.5; }
          50% { transform: translate(-50%, -50%) scale(1.2); opacity: 0.8; }
        }
        @keyframes nfc-dot-success {
          0% { transform: translate(-50%, -50%) scale(0); }
          60% { transform: translate(-50%, -50%) scale(1.5); }
          100% { transform: translate(-50%, -50%) scale(1); }
        }
      `}</style>
    </div>
  );
}
