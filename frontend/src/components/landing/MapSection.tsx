'use client';
import { MapContainer, TileLayer, Circle, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useState } from 'react';
import ScrollAnimation from './ScrollAnimation';

// Reset map view based on points
function MapController({ points }) {
    const map = useMap();
    useEffect(() => {
        if (points.length > 0) {
            // Find bounds
            const lats = points.map(p => p.lat);
            const lngs = points.map(p => p.lng);
            const minLat = Math.min(...lats);
            const maxLat = Math.max(...lats);
            const minLng = Math.min(...lngs);
            const maxLng = Math.max(...lngs);

            // Pad bounds slightly
            map.fitBounds([[minLat, minLng], [maxLat, maxLng]], { padding: [50, 50] });
        }
    }, [points, map]);
    return null;
}

export default function MapSection() {
    const [coverage, setCoverage] = useState([]);

    useEffect(() => {
        // Fetch coverage data
        fetch('/api/v1/landing/coverage')
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setCoverage(data.data);
                }
            })
            .catch(err => console.error("Map fetch error:", err));
    }, []);

    const center = coverage.length > 0 ? [coverage[0].lat, coverage[0].lng] : [-6.595038, 106.816635]; // Default Fallback

    return (
        <section className="py-24 bg-slate-50 dark:bg-slate-900" id="coverage">
            <div className="container mx-auto px-6 md:px-12 lg:px-24">
                <ScrollAnimation className="text-center mb-16">
                    <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 dark:text-white mb-4 tracking-tight">Area Jangkauan</h2>
                    <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
                        Kami terus memperluas jaringan berkualitas di wilayah Anda.
                    </p>
                </ScrollAnimation>

                <ScrollAnimation className="w-full h-[500px] rounded-3xl overflow-hidden shadow-2xl ring-1 ring-slate-200 dark:ring-slate-800">
                    <MapContainer
                        center={center}
                        zoom={13}
                        scrollWheelZoom={false}
                        className="w-full h-full z-0"
                        style={{ height: '500px', width: '100%' }}
                    >
                        <TileLayer
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />

                        {coverage.map((point, idx) => (
                            <Circle
                                key={idx}
                                center={[point.lat, point.lng]}
                                pathOptions={{ fillColor: '#2563eb', color: '#2563eb', opacity: 0.2, fillOpacity: 0.4 }}
                                radius={200} // 200m radius obfuscation
                            />
                        ))}

                        <MapController points={coverage} />
                    </MapContainer>
                </ScrollAnimation>
            </div>
        </section>
    );
}
