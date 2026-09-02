/**
 * The build version the Account tab's About section renders (webapp used the
 * __APP_VERSION__ define, injected by its build; the port reads the web
 * package's version the same way the define sourced it).
 */
import pkg from "../../package.json";

export const APP_VERSION: string = pkg.version;
