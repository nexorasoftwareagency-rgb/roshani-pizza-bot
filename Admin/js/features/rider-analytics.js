/**
 * ROSHANI ERP | RIDER INTELLIGENCE
 * Analytics and performance monitoring for delivery personnel.
 */

import { Outlet, get, query, orderByChild, equalTo } from '../firebase.js';
import { state } from '../state.js';
import { escapeHtml, showToast, formatDate, getISTDateString, getSkeletonDivs } from '../utils.js';
import { settleRiderWallet } from './riders.js';
import { createGrid, updateGridData, GRID_DEFAULTS, loadTabulator } from '../tabulator-setup.js';
import { loadJSPDF } from './printing.js';

let riderEarningsChart = null;
let _grid = null;

export async function generateRiderPerformanceReport() {