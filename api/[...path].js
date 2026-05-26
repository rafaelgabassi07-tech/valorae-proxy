import { dispatchRoute } from '../routes/_router.js';

export default async function handler(req, res) {
  return dispatchRoute(req, res);
}
