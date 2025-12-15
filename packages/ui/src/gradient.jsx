"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Gradient = Gradient;
function Gradient(_a) {
    var conic = _a.conic, className = _a.className, small = _a.small;
    return (<span className={"ui:absolute ui:mix-blend-normal ui:will-change-[filter] ui:rounded-[100%] ".concat(small ? "ui:blur-[32px]" : "ui:blur-[75px]", " ").concat(conic
            ? "ui:bg-[conic-gradient(from_180deg_at_50%_50%,var(--red-1000)_0deg,_var(--purple-1000)_180deg,_var(--blue-1000)_360deg)]"
            : "", " ").concat(className !== null && className !== void 0 ? className : "")}/>);
}
