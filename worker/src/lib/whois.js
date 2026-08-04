// src/lib/whois.js — deep single-domain registration record (via RDAP).
// (Classic WHOIS-over-port-43 isn't reachable from Workers; RDAP is the
// modern, HTTP-based replacement and returns the same registration data.)
import { lookupRegistration } from "./rdap.js";

export async function whois(domain) {
  return lookupRegistration(domain);
}
