import { useEffect, useMemo, useState } from "react"
import L, { type LatLngBoundsExpression, type LatLngExpression } from "leaflet"
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  ZoomControl,
  useMap,
} from "react-leaflet"
import type { RiskCategory } from "../services/riskScoringService"

export interface MapPoint {
  id: string
  latitude: number
  longitude: number
  label: string
  detail?: string
  category?: RiskCategory
}

interface GeoMapProps {
  points: MapPoint[]
  center?: [number, number]
  zoom?: number
  fitPoints?: boolean
  loading?: boolean
  error?: string
  emptyMessage?: string
  className?: string
}

const INDIA_CENTER: [number, number] = [22.8, 79]

function MapViewport({
  points,
  center,
  zoom,
  fitPoints,
}: {
  points: MapPoint[]
  center: [number, number]
  zoom: number
  fitPoints: boolean
}) {
  const map = useMap()

  useEffect(() => {
    if (fitPoints && points.length > 1) {
      const bounds = points.map(
        (point) => [point.latitude, point.longitude],
      ) as LatLngBoundsExpression
      map.fitBounds(bounds, { padding: [34, 34], maxZoom: 8 })
      return
    }
    map.setView(center, zoom)
  }, [center, fitPoints, map, points, zoom])

  return null
}

function RecenterControl({
  points,
  center,
  zoom,
  fitPoints,
}: {
  points: MapPoint[]
  center: [number, number]
  zoom: number
  fitPoints: boolean
}) {
  const map = useMap()

  function recenter() {
    if (fitPoints && points.length > 1) {
      map.fitBounds(
        points.map((point) => [
          point.latitude,
          point.longitude,
        ]) as LatLngBoundsExpression,
        { padding: [34, 34], maxZoom: 8 },
      )
      return
    }
    map.setView(center, zoom)
  }

  return (
    <div className="leaflet-bottom leaflet-right map-recenter-control">
      <div className="leaflet-control">
        <button type="button" onClick={recenter} aria-label="Recenter map">
          <span aria-hidden="true">⌖</span>
        </button>
      </div>
    </div>
  )
}

function markerIcon(category: RiskCategory | undefined) {
  return L.divIcon({
    className: "climateshield-marker-shell",
    html: `<span class="climateshield-marker climateshield-marker--${(category ?? "location").toLowerCase()}"></span>`,
    iconSize: [28, 36],
    iconAnchor: [14, 34],
    popupAnchor: [0, -30],
  })
}

export default function GeoMap({
  points,
  center,
  zoom = 10,
  fitPoints = false,
  loading = false,
  error,
  emptyMessage = "No validated coordinates are available for this map.",
  className = "",
}: GeoMapProps) {
  const validPoints = useMemo(
    () =>
      points.filter(
        (point) =>
          Number.isFinite(point.latitude) &&
          Number.isFinite(point.longitude) &&
          point.latitude >= -90 &&
          point.latitude <= 90 &&
          point.longitude >= -180 &&
          point.longitude <= 180,
      ),
    [points],
  )
  const centerIsValid =
    center !== undefined &&
    Number.isFinite(center[0]) &&
    Number.isFinite(center[1]) &&
    center[0] >= -90 &&
    center[0] <= 90 &&
    center[1] >= -180 &&
    center[1] <= 180
  const mapCenter =
    (centerIsValid ? center : undefined) ??
    (validPoints[0]
      ? [validPoints[0].latitude, validPoints[0].longitude]
      : INDIA_CENTER)
  const [tilesLoading, setTilesLoading] = useState(true)
  const [tileError, setTileError] = useState("")

  if (!validPoints.length && !loading && !centerIsValid) {
    return (
      <div className={`geo-map geo-map--empty ${className}`}>
        <strong>Map unavailable</strong>
        <span>{error || emptyMessage}</span>
      </div>
    )
  }

  return (
    <div className={`geo-map ${className}`}>
      <MapContainer
        center={mapCenter as LatLngExpression}
        zoom={zoom}
        zoomControl={false}
        scrollWheelZoom
        className="geo-map__canvas"
      >
        <TileLayer
          attribution="Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community"
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          eventHandlers={{
            loading: () => setTilesLoading(true),
            load: () => {
              setTilesLoading(false)
              setTileError("")
            },
            tileerror: () => {
              setTilesLoading(false)
              setTileError(
                "Satellite tiles could not be loaded. Check the network connection.",
              )
            },
          }}
        />
        <ZoomControl position="topright" />
        <RecenterControl
          points={validPoints}
          center={mapCenter as [number, number]}
          zoom={zoom}
          fitPoints={fitPoints}
        />
        <MapViewport
          points={validPoints}
          center={mapCenter as [number, number]}
          zoom={zoom}
          fitPoints={fitPoints}
        />
        {validPoints.map((point) => (
          <Marker
            key={point.id}
            position={[point.latitude, point.longitude]}
            icon={markerIcon(point.category)}
          >
            <Popup>
              <strong>{point.label}</strong>
              {point.detail && <span>{point.detail}</span>}
              {point.category && <b>{point.category} risk</b>}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      {(loading || tilesLoading) && !tileError && (
        <div className="geo-map__status" aria-live="polite">
          <span />
          Loading geographic tiles…
        </div>
      )}
      {(error || tileError) && (
        <div className="geo-map__status geo-map__status--error" role="alert">
          {error || tileError}
        </div>
      )}
      <div className="geo-map__legend" aria-label="Risk category legend">
        {(["Low", "Moderate", "High", "Critical"] as RiskCategory[]).map(
          (category) => (
            <span key={category}>
              <i className={`risk-dot risk-dot--${category.toLowerCase()}`} />
              {category}
            </span>
          ),
        )}
      </div>
      <div className="geo-map__disclaimer">
        Geographic context only · No verified hazard overlay
      </div>
    </div>
  )
}
