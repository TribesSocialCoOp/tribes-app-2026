import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0f172a', // Slate 900
          backgroundImage: 'radial-gradient(circle at 50% 50%, #1e293b 0%, #0f172a 100%)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '40px',
            borderRadius: '100%',
            backgroundColor: 'rgba(33, 150, 243, 0.1)',
            boxShadow: '0 0 80px rgba(33, 150, 243, 0.3)',
            marginBottom: '40px',
          }}
        >
          {/* Exact Lucide Tent icon paths — matches the AppLogo used in the sidebar */}
          <svg
            width="160"
            height="160"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#2196F3"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              filter: 'drop-shadow(0 0 10px rgba(33, 150, 243, 0.9)) drop-shadow(0 0 30px rgba(33, 150, 243, 0.4))',
            }}
          >
            <path d="M3.5 21 14 3" />
            <path d="M20.5 21 10 3" />
            <path d="M15.5 21 12 15l-3.5 6" />
            <path d="M2 21h20" />
          </svg>
        </div>
        <div
          style={{
            fontSize: '80px',
            fontWeight: 'bold',
            color: 'white',
            fontFamily: 'sans-serif',
            letterSpacing: '-0.02em',
          }}
        >
          Tribes
        </div>
        <div
          style={{
            fontSize: '32px',
            color: '#94a3b8',
            fontFamily: 'sans-serif',
            marginTop: '16px',
          }}
        >
          Find your people.
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
