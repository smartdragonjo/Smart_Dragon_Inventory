export const clean = value => String(value ?? '').trim().replace(/\s+/g, ' ');
export const key = value => clean(value).toLowerCase();
export function normalizeVehicle(vehicle) {
    const original = { make: vehicle.make, model: vehicle.model };
    const transformations = [];
    const make = clean(vehicle.make);
    let model = clean(vehicle.model);
    if (make !== vehicle.make || model !== vehicle.model) transformations.push('normalized_whitespace');
    if (make && key(model).startsWith(key(make) + ' ')) {
        model = model.slice(make.length).trim();
        transformations.push('removed_make_prefix');
    }
    let yearHint = null;
    const year = model.match(/\s+(\d{4})$/);
    if (year && +year[1] >= 1950 && +year[1] <= 2100) {
        yearHint = +year[1];
        model = model.slice(0, year.index);
        transformations.push('extracted_year_hint');
    }
    return { original, lookup: { make, model, yearHint }, transformations };
}
