import { Cell, CurrentShipType } from "./types";
import { FieldParams } from "./enums";

const { FIELD_SIZE, FIELD_SIZE_MINUS, FIELD_SIZE_PLUS } = FieldParams;

export const createCells = () => {
  const mainArray: Cell[] = [];

  for (let i = 0; i < Math.pow(FIELD_SIZE, 2); i++) {
    mainArray.push({ id: i, isHit: false, shipId: 0 });
  }

  return mainArray;
};

export const createShipTypes = (): CurrentShipType[] => {
  return [
    { decks: 1, leftToBuild: 4, isBuilding: true },
    { decks: 2, leftToBuild: 3, isBuilding: false },
    { decks: 3, leftToBuild: 2, isBuilding: false },
    { decks: 4, leftToBuild: 1, isBuilding: false },
  ];
};

export const checkCell = (id: number, shipId: number, builtDecks: number, field: Cell[]) => {
  let allowedCells: number[] = [];
  let forbiddenCells: number[] = [];

  if (id % FIELD_SIZE === 0) {
    allowedCells = [id + 1, id + FIELD_SIZE, id - FIELD_SIZE];
    forbiddenCells = [id + 1, id + FIELD_SIZE, id - FIELD_SIZE, id - FIELD_SIZE_MINUS, id + FIELD_SIZE_PLUS];
  }

  if (id % FIELD_SIZE === FIELD_SIZE_MINUS) {
    allowedCells = [id - 1, id - FIELD_SIZE, id + FIELD_SIZE];
    forbiddenCells = [id - 1, id + FIELD_SIZE, id - FIELD_SIZE, id + FIELD_SIZE_MINUS, id - FIELD_SIZE_PLUS];
  }

  if (id % FIELD_SIZE !== FIELD_SIZE_MINUS && id % FIELD_SIZE !== 0) {
    allowedCells = [id + 1, id - 1, id + FIELD_SIZE, id - FIELD_SIZE];
    forbiddenCells = [
      id + 1,
      id - 1,
      id + FIELD_SIZE,
      id - FIELD_SIZE,
      id - FIELD_SIZE_MINUS,
      id + FIELD_SIZE_MINUS,
      id + FIELD_SIZE_PLUS,
      id - FIELD_SIZE_PLUS,
    ];
  }

  if (builtDecks === 0) {
    const cellHasForbidden = forbiddenCells.some((item: number) => {
      return field[item] && field[item]?.shipId !== 0;
    });

    return !cellHasForbidden;
  }

  const cellHasShip = allowedCells.some((item: number) => {
    return field[item]?.shipId === shipId;
  });

  const cellHasForbidden = forbiddenCells.some((item: number) => {
    return field[item] && field[item]?.shipId !== shipId && field[item]?.shipId !== 0;
  });

  return cellHasShip && !cellHasForbidden;
};
