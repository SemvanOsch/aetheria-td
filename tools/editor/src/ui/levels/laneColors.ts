/** Each lane's colour on the board editor, its tab, and its wave rows. */
const LANE_COLORS = ['#e8bf5e', '#6fd6ff', '#ff8a7a', '#c39bff', '#7fd38a', '#f2a65a'];

export const laneColor = (i: number) => LANE_COLORS[i % LANE_COLORS.length];
