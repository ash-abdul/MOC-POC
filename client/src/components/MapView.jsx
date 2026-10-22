// Leaflet map with OpenStreetMap tiles (the real map service allowed by section 8).
// Props:
//   center [lat,lng], zoom
//   home {lat,lng}           – red home pin; draggable when onHomeChange is given
//   schools [{id,lat,lng,label,highlight}]
//   polygons [{geojson, color, label, dashed}]
//   stops [{lat,lng,label}]
//   onClick(latlng)          – click on the map
//   drawing {points, onChange} – simple polygon drawing (click to add vertices)
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const homeIcon = L.divIcon({ className: '', html: '<div class="pin-home"></div>', iconSize: [18, 18], iconAnchor: [9, 18] });
const schoolIcon = (label, hl) => L.divIcon({ className: '', html: `<div class="pin-school" style="${hl ? 'background:#1b1d21' : ''}">${label}</div>`, iconSize: null, iconAnchor: [12, 10] });

export default function MapView({ center = [25.31, 55.44], zoom = 12, home, onHomeChange, schools = [], polygons = [], stops = [], onClick, drawing, className = '', fitTo }) {
  const el = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const cb = useRef({});
  cb.current = { onClick, onHomeChange, drawing };

  useEffect(() => {
    map.current = L.map(el.current, { zoomControl: true, attributionControl: true }).setView(center, zoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    map.current.on('click', (e) => {
      const { drawing: d, onClick: oc } = cb.current;
      if (d) d.onChange([...(d.points || []), [e.latlng.lng, e.latlng.lat]]);
      else oc?.({ lat: e.latlng.lat, lng: e.latlng.lng });
    });
    const ro = new ResizeObserver(() => map.current?.invalidateSize());
    ro.observe(el.current);
    return () => { ro.disconnect(); map.current.remove(); };
  }, []);

  useEffect(() => {
    const g = layer.current;
    g.clearLayers();
    const bounds = [];
    for (const p of polygons) {
      if (!p.geojson) continue;
      const gl = L.geoJSON(p.geojson, { style: { color: p.color || '#92722a', weight: 2, fillOpacity: p.fill ?? 0.08, dashArray: p.dashed ? '6 4' : null } });
      if (p.label) gl.bindTooltip(p.label, { sticky: true });
      gl.addTo(g);
      if (p.fit) bounds.push(gl.getBounds());
    }
    for (const s of stops) L.circleMarker([s.lat, s.lng], { radius: 6, color: '#0a6aa8', fillColor: '#20a1e0', fillOpacity: 0.9, weight: 2 }).bindTooltip(s.label || '').addTo(g);
    for (const s of schools) {
      const m = L.marker([s.lat, s.lng], { icon: schoolIcon(s.short || '🏫', s.highlight) }).addTo(g);
      if (s.label) m.bindTooltip(s.label);
      bounds.push(L.latLngBounds([s.lat, s.lng], [s.lat, s.lng]));
    }
    if (home) {
      const m = L.marker([home.lat, home.lng], { icon: homeIcon, draggable: !!onHomeChange, zIndexOffset: 1000 }).addTo(g);
      if (onHomeChange) m.on('dragend', () => { const ll = m.getLatLng(); cb.current.onHomeChange?.({ lat: ll.lat, lng: ll.lng }); });
      bounds.push(L.latLngBounds([home.lat, home.lng], [home.lat, home.lng]));
    }
    if (drawing?.points?.length) {
      const latlngs = drawing.points.map(([lng, lat]) => [lat, lng]);
      L.polygon(latlngs, { color: '#d0312d', weight: 2, dashArray: '4 4', fillOpacity: 0.1 }).addTo(g);
      latlngs.forEach((ll) => L.circleMarker(ll, { radius: 4, color: '#d0312d' }).addTo(g));
    }
    if (fitTo === 'all' && bounds.length) {
      const b = bounds.reduce((a, x) => a.extend(x), L.latLngBounds(bounds[0].getSouthWest(), bounds[0].getNorthEast()));
      map.current.fitBounds(b.pad(0.15), { maxZoom: 14 });
    }
  }, [home, schools, polygons, stops, drawing, fitTo]);

  useEffect(() => {
    if (fitTo !== 'all' && center) map.current.setView(center, map.current.getZoom() < zoom ? zoom : map.current.getZoom());
  }, [center?.[0], center?.[1]]);

  return <div ref={el} className={`map ${className}`} />;
}
