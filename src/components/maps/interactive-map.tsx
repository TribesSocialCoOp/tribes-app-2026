
"use client";

import React, { useEffect, useRef } from 'react';
import type L from 'leaflet';
import { Card, CardContent } from '@/components/ui/card';
import { MapPin, Loader2 } from 'lucide-react';

// Next.js handles these imports at build time — no shell scripts or vendor dirs needed.
// CSS is injected by the bundler; image imports resolve to hashed public URLs.
import 'leaflet/dist/leaflet.css';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

interface InteractiveMapProps {
  latitude?: number;
  longitude?: number;
  zoom?: number;
  locationName?: string;
  className?: string;
}

/**
 * LeafletMap — renders a real map using Leaflet + OpenStreetMap tiles.
 * CSS and marker images are handled by Next.js static imports.
 * The map itself is initialized imperatively to avoid SSR/hydration issues.
 */
function LeafletMap({ latitude, longitude, zoom = 14, locationName }: InteractiveMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapRef.current || !latitude || !longitude) return;
    if (mapInstanceRef.current) return; // Already initialized

    const initMap = async () => {
      const L = (await import('leaflet')).default;

      const map = L.map(mapRef.current!, {
        scrollWheelZoom: false,
      }).setView([latitude, longitude], zoom);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      const icon = L.icon({
        iconUrl: markerIcon.src,
        iconRetinaUrl: markerIcon2x.src,
        shadowUrl: markerShadow.src,
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41],
      });

      const marker = L.marker([latitude, longitude], { icon }).addTo(map);
      if (locationName) {
        const el = document.createElement('strong');
        el.textContent = locationName;
        marker.bindPopup(el);
      }

      mapInstanceRef.current = map;
    };

    initMap();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [latitude, longitude, zoom, locationName]);

  return (
    <div
      ref={mapRef}
      style={{ height: '100%', width: '100%', borderRadius: 'inherit' }}
    />
  );
}

/**
 * InteractiveMap Component
 *
 * Renders an OpenStreetMap-powered interactive map with a marker.
 * Falls back to a styled placeholder if no coordinates are provided.
 */
export function InteractiveMap({
  latitude,
  longitude,
  zoom = 14,
  locationName,
  className,
}: InteractiveMapProps) {
  // Fallback: no coordinates provided
  if (!latitude || !longitude) {
    return (
      <Card className={className}>
        <CardContent className="p-0 aspect-video bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-950 dark:to-blue-900 rounded-md flex flex-col items-center justify-center">
          <MapPin className="h-12 w-12 text-blue-500/60 mb-2" />
          {locationName && (
            <p className="text-sm font-medium text-blue-700 dark:text-blue-300 text-center px-4">
              {locationName}
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardContent className="p-0 aspect-video rounded-md overflow-hidden">
        <LeafletMap
          latitude={latitude}
          longitude={longitude}
          zoom={zoom}
          locationName={locationName}
        />
      </CardContent>
    </Card>
  );
}

export default InteractiveMap;
