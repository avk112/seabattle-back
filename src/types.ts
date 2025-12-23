export interface Cell {
  id: number;
  isHit: boolean;
  shipId: number;
}
export interface CurrentShipType {
  decks: number;
  leftToBuild: number;
  isBuilding: boolean;
}

export interface Player {
  id: string;
  ready: boolean;
  field: Cell[];
  opponentView: Cell[];
  currentShipType: CurrentShipType[];
  builtDecks: number;
}
