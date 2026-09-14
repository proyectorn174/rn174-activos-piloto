import "leaflet";

declare module "leaflet" {
  interface Map {
    off(type: "click", fn: (event: LeafletMouseEvent) => void): void;
  }
}
