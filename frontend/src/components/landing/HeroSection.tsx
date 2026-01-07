'use client';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Points, PointMaterial } from '@react-three/drei';
import { Suspense, useRef, useMemo, useState, useEffect } from 'react';
import * as random from 'maath/random/dist/maath-random.esm';
import Link from 'next/link';
import ScrollAnimation from './ScrollAnimation';

// Smooth Particle Wave similar to Fabric/Cloth simulation
function ParticleCloth(props) {
    const ref = useRef();

    // Create a grid of points instead of random sphere
    // This simulates a 'fabric' or 'wave' better
    const count = 3000;
    const positions = useMemo(() => {
        const pos = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            // Spread nicely across the screen
            pos[i * 3] = (Math.random() - 0.5) * 10;     // x: wide spread
            pos[i * 3 + 1] = (Math.random() - 0.5) * 5;  // y: medium height
            pos[i * 3 + 2] = (Math.random() - 0.5) * 2;  // z: depth
        }
        return pos;
    }, []);

    useFrame((state, delta) => {
        const { clock } = state;
        const t = clock.getElapsedTime() * 0.5;

        if (ref.current && ref.current.geometry && ref.current.geometry.attributes.position) {
            const positions = ref.current.geometry.attributes.position.array;

            for (let i = 0; i < count; i++) {
                const x = positions[i * 3];
                // Wave math: Y position oscillates based on X, Z and time
                // Creates a gentle rolling carpet/cloth effect
                positions[i * 3 + 1] = Math.sin(x * 0.5 + t) * 0.5 + Math.cos(x * 0.3 + t * 0.8) * 0.3;
            }
            ref.current.geometry.attributes.position.needsUpdate = true;

            // Slow gentle rotation
            ref.current.rotation.y = t * 0.05;
        }
    });

    return (
        <group rotation={[Math.PI / 6, 0, 0]}> {/* Tilted slightly towards camera */}
            <Points ref={ref} positions={positions} stride={3} frustumCulled={false} {...props}>
                <PointMaterial
                    transparent
                    color="#3b82f6" // Blue-500
                    size={0.015}
                    sizeAttenuation={true}
                    depthWrite={false}
                    opacity={0.8}
                />
            </Points>
        </group>
    );
}

// Interactive Camera that moves slightly with mouse
function Rig() {
    const { camera, mouse } = useThree()
    useFrame(() => {
        camera.position.x += (mouse.x * 2 - camera.position.x) * 0.05
        camera.position.y += (-mouse.y * 2 - camera.position.y) * 0.05
        camera.lookAt(0, 0, 0)
    })
    return null
}

export default function HeroSection({ content }) {
    const headline = content?.headline || "Internet Cepat & Stabil";
    const subhead = content?.subheadline || "Solusi internet fiber optic terbaik untuk rumah dan bisnis Anda.";
    const ctaText = content?.ctaText || "Daftar Sekarang";

    return (
        <section className="relative w-full h-screen overflow-hidden bg-slate-900">
            {/* 1. Fullscreen Animation Background */}
            <div className="absolute inset-0 z-0 w-full h-full">
                <Canvas camera={{ position: [0, 0, 4], fov: 60 }} gl={{ antialias: true, alpha: true }}>
                    {/* <ambientLight intensity={0.5} /> */}
                    <Suspense fallback={null}>
                        <ParticleCloth />
                    </Suspense>
                    <Rig />
                </Canvas>
            </div>

            {/* 2. Gradient Overlay for Text Readability */}
            {/* Left side: Solid/Dark to Transparent Gradient */}
            <div className="absolute inset-0 z-10 bg-gradient-to-r from-slate-900 via-slate-900/80 to-transparent"></div>

            {/* 3. Text Content */}
            <div className="relative z-20 h-full container mx-auto px-6 md:px-12 lg:px-24 flex items-center">
                <ScrollAnimation className="w-full md:w-2/3 lg:w-1/2">
                    <div className="inline-block px-4 py-1.5 mb-6 text-xs font-bold tracking-widest text-cyan-400 uppercase bg-cyan-900/30 rounded-full border border-cyan-700/50 backdrop-blur-sm">
                        Kita Selalu Terkoneksi
                    </div>
                    <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold leading-tight mb-6 text-white tracking-tight drop-shadow-lg">
                        {headline}
                    </h1>
                    <p className="text-lg md:text-xl text-slate-200 mb-10 max-w-lg leading-relaxed drop-shadow-md border-l-4 border-cyan-500 pl-4 py-1 bg-gradient-to-r from-slate-800/50 to-transparent rounded-r-lg backdrop-blur-sm">
                        {subhead}
                    </p>
                    <div className="flex flex-col sm:flex-row gap-4">
                        <Link href="/customer/register">
                            <button className="px-8 py-4 text-white bg-gradient-to-r from-blue-600 to-cyan-600 rounded-full font-bold shadow-lg shadow-cyan-500/30 hover:shadow-cyan-500/50 transform hover:-translate-y-1 transition-all border border-white/10">
                                {ctaText}
                            </button>
                        </Link>
                        <Link href="/customer/login">
                            <button className="px-8 py-4 text-white bg-white/5 backdrop-blur-md border border-white/20 rounded-full font-bold hover:bg-white/10 transition-all">
                                Login Portal
                            </button>
                        </Link>
                    </div>
                </ScrollAnimation>
            </div>
        </section>
    );
}
