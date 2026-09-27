import React, { useState, useEffect, useMemo } from "react";
import {
    Calculator,
    Settings,
    Plus,
    Trash2,
    Info,
    Zap,
    DollarSign,
    AlertCircle,
} from "lucide-react";

const PROVINCE_PRESETS = {
    Custom: {
        name: "Custom",
        tier1Rate: 0.1,
        tier2Rate: 0.15,
        tier1Threshold: 40,
        hasTier2: false,
        fixedFee: 0.5,
    },
    QC: {
        name: "Quebec (Rate D)",
        tier1Rate: 0.06509,
        tier2Rate: 0.10041,
        tier1Threshold: 40,
        hasTier2: true,
        fixedFee: 0.4349, // daily
    },
    ON: {
        name: "Ontario (Tiered)",
        tier1Rate: 0.103,
        tier2Rate: 0.125,
        tier1Threshold: 20, // Approx 600kWh/month average
        hasTier2: true,
        fixedFee: 0.5, // daily avg
    },
    BC: {
        name: "British Columbia",
        tier1Rate: 0.1097,
        tier2Rate: 0.1408,
        tier1Threshold: 22.26,
        hasTier2: true,
        fixedFee: 0.2128,
    },
    AB: {
        name: "Alberta (Flat)",
        tier1Rate: 0.09,
        tier2Rate: 0.09,
        tier1Threshold: 0,
        hasTier2: false,
        fixedFee: 0.8,
    },
    NS: {
        name: "Nova Scotia (Flat)",
        tier1Rate: 0.17153,
        tier2Rate: 0.17153,
        tier1Threshold: 0,
        hasTier2: false,
        fixedFee: 0.622,
    },
};

function useLocalStorage(key, initialValue) {
    const [storedValue, setStoredValue] = useState(() => {
        if (typeof window === "undefined") return initialValue;
        try {
            const item = window.localStorage.getItem(key);
            return item ? JSON.parse(item) : initialValue;
        } catch (error) {
            console.error(error);
            return initialValue;
        }
    });

    const setValue = (value) => {
        try {
            const valueToStore =
                value instanceof Function ? value(storedValue) : value;
            setStoredValue(valueToStore);
            if (typeof window !== "undefined") {
                window.localStorage.setItem(key, JSON.stringify(valueToStore));
            }
        } catch (error) {
            console.error(error);
        }
    };
    return [storedValue, setValue];
}

export default function EnergyEstimator() {
    // State for global calculator settings
    const [settings, setSettings] = useLocalStorage("energy_settings", {
        province: "QC",
        ...PROVINCE_PRESETS["QC"],
    });

    // State for the list of appliances
    const [appliances, setAppliances] = useLocalStorage("energy_appliances", [
        {
            id: "1",
            name: "Refrigerator",
            wattage: 150,
            hoursPerDay: 24,
            daysPerMonth: 30,
        },
    ]);

    // State for the new appliance form
    const [newAppliance, setNewAppliance] = useState({
        name: "",
        wattage: "",
        hoursPerDay: "",
        daysPerMonth: "",
    });

    const handlePresetChange = (e) => {
        const presetKey = e.target.value;
        if (presetKey === "Custom") {
            setSettings((prev) => ({ ...prev, province: "Custom" }));
        } else {
            setSettings({
                province: presetKey,
                ...PROVINCE_PRESETS[presetKey],
            });
        }
    };

    const handleSettingChange = (field, value) => {
        setSettings((prev) => ({
            ...prev,
            province: "Custom",
            [field]: value,
        }));
    };

    const addAppliance = (e) => {
        e.preventDefault();
        if (!newAppliance.name || !newAppliance.wattage) return;

        const applianceToAdd = {
            id: crypto.randomUUID(),
            name: newAppliance.name,
            wattage: parseFloat(newAppliance.wattage),
            // If empty, default to undefined which will be treated as 24/7 later
            hoursPerDay:
                newAppliance.hoursPerDay !== ""
                    ? parseFloat(newAppliance.hoursPerDay)
                    : null,
            daysPerMonth:
                newAppliance.daysPerMonth !== ""
                    ? parseFloat(newAppliance.daysPerMonth)
                    : null,
        };

        setAppliances([...appliances, applianceToAdd]);
        setNewAppliance({
            name: "",
            wattage: "",
            hoursPerDay: "",
            daysPerMonth: "",
        });
    };

    const removeAppliance = (id) => {
        setAppliances(appliances.filter((a) => a.id !== id));
    };

    const calculations = useMemo(() => {
        const daysInMonth = 30; // Standardize billing month for calculation

        // Calculate kWh per appliance
        const enrichedAppliances = appliances.map((app) => {
            const hrs =
                app.hoursPerDay !== null && app.hoursPerDay !== undefined
                    ? app.hoursPerDay
                    : 24;
            const days =
                app.daysPerMonth !== null && app.daysPerMonth !== undefined
                    ? app.daysPerMonth
                    : daysInMonth;

            const monthlyKWh = (app.wattage * hrs * days) / 1000;
            return {
                ...app,
                calculatedKWh: monthlyKWh,
                assumedHrs: hrs,
                assumedDays: days,
            };
        });

        const totalMonthlyKWh = enrichedAppliances.reduce(
            (sum, app) => sum + app.calculatedKWh,
            0,
        );

        // Tiered Billing Calculation
        const monthlyThreshold = settings.tier1Threshold * daysInMonth;
        let tier1KWh = 0;
        let tier2KWh = 0;

        if (!settings.hasTier2) {
            tier1KWh = totalMonthlyKWh;
        } else {
            tier1KWh = Math.min(totalMonthlyKWh, monthlyThreshold);
            tier2KWh = Math.max(0, totalMonthlyKWh - monthlyThreshold);
        }

        const tier1Cost = tier1KWh * settings.tier1Rate;
        const tier2Cost = tier2KWh * settings.tier2Rate;
        const totalEnergyCost = tier1Cost + tier2Cost;

        const fixedMonthlyFee = settings.fixedFee * daysInMonth;
        const totalBill = totalEnergyCost + fixedMonthlyFee;

        // Calculate an "effective rate" to estimate cost per appliance fairly
        const effectiveRatePerKWh =
            totalMonthlyKWh > 0 ? totalEnergyCost / totalMonthlyKWh : 0;

        return {
            enrichedAppliances,
            totalMonthlyKWh,
            tier1KWh,
            tier2KWh,
            tier1Cost,
            tier2Cost,
            fixedMonthlyFee,
            totalBill,
            effectiveRatePerKWh,
            daysInMonth,
        };
    }, [appliances, settings]);

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-4 md:p-8">
            <div className="max-w-6xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex items-center space-x-3 mb-8">
                    <div className="p-3 bg-blue-600 rounded-lg shadow-lg">
                        <Zap className="text-white w-8 h-8" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-slate-800">
                            Energy Cost Estimator
                        </h1>
                        <p className="text-slate-500">
                            Calculate monthly electrical expenses for your
                            household
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* LEFT COLUMN: Settings & Form */}
                    <div className="lg:col-span-5 space-y-6">
                        {/* Settings Card */}
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                            <div className="flex items-center space-x-2 mb-4 pb-3 border-b border-slate-100">
                                <Settings className="text-slate-400 w-5 h-5" />
                                <h2 className="text-lg font-semibold text-slate-800">
                                    Rate Settings
                                </h2>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">
                                        Province / Preset
                                    </label>
                                    <select
                                        value={settings.province}
                                        onChange={handlePresetChange}
                                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    >
                                        {Object.entries(PROVINCE_PRESETS).map(
                                            ([key, data]) => (
                                                <option key={key} value={key}>
                                                    {data.name}
                                                </option>
                                            ),
                                        )}
                                    </select>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">
                                            Tier 1 Rate ($/kWh)
                                        </label>
                                        <input
                                            type="number"
                                            step="0.00001"
                                            min="0"
                                            value={settings.tier1Rate}
                                            onChange={(e) =>
                                                handleSettingChange(
                                                    "tier1Rate",
                                                    parseFloat(
                                                        e.target.value,
                                                    ) || 0,
                                                )
                                            }
                                            className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">
                                            Fixed Fee ($/day)
                                        </label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={settings.fixedFee}
                                            onChange={(e) =>
                                                handleSettingChange(
                                                    "fixedFee",
                                                    parseFloat(
                                                        e.target.value,
                                                    ) || 0,
                                                )
                                            }
                                            className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                </div>

                                <div className="flex items-center mt-2">
                                    <input
                                        type="checkbox"
                                        id="hasTier2"
                                        checked={settings.hasTier2}
                                        onChange={(e) =>
                                            handleSettingChange(
                                                "hasTier2",
                                                e.target.checked,
                                            )
                                        }
                                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                                    />
                                    <label
                                        htmlFor="hasTier2"
                                        className="ml-2 text-sm text-slate-700 font-medium"
                                    >
                                        Enable Tier 2 Pricing
                                    </label>
                                </div>

                                {settings.hasTier2 && (
                                    <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                                Tier 2 Rate ($/kWh)
                                            </label>
                                            <input
                                                type="number"
                                                step="0.00001"
                                                min="0"
                                                value={settings.tier2Rate}
                                                onChange={(e) =>
                                                    handleSettingChange(
                                                        "tier2Rate",
                                                        parseFloat(
                                                            e.target.value,
                                                        ) || 0,
                                                    )
                                                }
                                                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center">
                                                Threshold
                                                <span className="text-xs text-slate-400 ml-1">
                                                    (kWh/day)
                                                </span>
                                            </label>
                                            <input
                                                type="number"
                                                step="1"
                                                min="0"
                                                value={settings.tier1Threshold}
                                                onChange={(e) =>
                                                    handleSettingChange(
                                                        "tier1Threshold",
                                                        parseFloat(
                                                            e.target.value,
                                                        ) || 0,
                                                    )
                                                }
                                                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {}
                        <form
                            onSubmit={addAppliance}
                            className="bg-white rounded-xl shadow-sm border border-slate-200 p-5"
                        >
                            <div className="flex items-center space-x-2 mb-4 pb-3 border-b border-slate-100">
                                <Plus className="text-slate-400 w-5 h-5" />
                                <h2 className="text-lg font-semibold text-slate-800">
                                    Add Appliance
                                </h2>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">
                                        Appliance / Baseline Name *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="e.g., Mini Fridge, Total House"
                                        value={newAppliance.name}
                                        onChange={(e) =>
                                            setNewAppliance({
                                                ...newAppliance,
                                                name: e.target.value,
                                            })
                                        }
                                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">
                                        Wattage (W) *
                                    </label>
                                    <input
                                        type="number"
                                        required
                                        min="1"
                                        placeholder="e.g., 150"
                                        value={newAppliance.wattage}
                                        onChange={(e) =>
                                            setNewAppliance({
                                                ...newAppliance,
                                                wattage: e.target.value,
                                            })
                                        }
                                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">
                                            Hours / Day
                                        </label>
                                        <input
                                            type="number"
                                            min="0"
                                            max="24"
                                            step="0.1"
                                            placeholder="24 (default)"
                                            value={newAppliance.hoursPerDay}
                                            onChange={(e) =>
                                                setNewAppliance({
                                                    ...newAppliance,
                                                    hoursPerDay: e.target.value,
                                                })
                                            }
                                            className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 placeholder:text-slate-400"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">
                                            Days / Month
                                        </label>
                                        <input
                                            type="number"
                                            min="0"
                                            max="31"
                                            step="1"
                                            placeholder="30 (default)"
                                            value={newAppliance.daysPerMonth}
                                            onChange={(e) =>
                                                setNewAppliance({
                                                    ...newAppliance,
                                                    daysPerMonth:
                                                        e.target.value,
                                                })
                                            }
                                            className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 placeholder:text-slate-400"
                                        />
                                    </div>
                                </div>

                                <div className="flex items-start space-x-2 text-xs text-slate-500 mt-2 bg-slate-50 p-2 rounded-md">
                                    <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                                    <p>
                                        Leave hours or days empty to assume the
                                        appliance runs continuously 24/7 (24
                                        hrs, 30 days).
                                    </p>
                                </div>

                                <button
                                    type="submit"
                                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg transition-colors flex justify-center items-center"
                                >
                                    <Plus className="w-4 h-4 mr-2" />
                                    Add to Calculation
                                </button>
                            </div>
                        </form>
                    </div>

                    {}
                    <div className="lg:col-span-7 space-y-6">
                        {/* Results Dashboard */}
                        <div className="bg-slate-800 rounded-xl shadow-lg border border-slate-700 overflow-hidden text-white relative">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500 opacity-10 rounded-bl-full blur-2xl pointer-events-none"></div>

                            <div className="p-6">
                                <h2 className="text-slate-300 text-sm font-medium mb-1 uppercase tracking-wider">
                                    Estimated Monthly Bill
                                </h2>
                                <div className="flex items-baseline space-x-2">
                                    <span className="text-5xl font-bold">
                                        ${calculations.totalBill.toFixed(2)}
                                    </span>
                                    <span className="text-slate-400">
                                        / month
                                    </span>
                                </div>

                                <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div className="bg-slate-700/50 p-3 rounded-lg">
                                        <p className="text-xs text-slate-400 mb-1">
                                            Total Usage
                                        </p>
                                        <p className="font-semibold">
                                            {calculations.totalMonthlyKWh.toFixed(
                                                1,
                                            )}{" "}
                                            kWh
                                        </p>
                                    </div>
                                    <div className="bg-slate-700/50 p-3 rounded-lg">
                                        <p className="text-xs text-slate-400 mb-1">
                                            Blended Rate
                                        </p>
                                        <p className="font-semibold text-green-400">
                                            $
                                            {calculations.effectiveRatePerKWh.toFixed(
                                                3,
                                            )}
                                            /kWh
                                        </p>
                                    </div>
                                    <div className="bg-slate-700/50 p-3 rounded-lg">
                                        <p className="text-xs text-slate-400 mb-1">
                                            Fixed Fees
                                        </p>
                                        <p className="font-semibold text-orange-300">
                                            $
                                            {calculations.fixedMonthlyFee.toFixed(
                                                2,
                                            )}
                                        </p>
                                    </div>
                                    <div className="bg-slate-700/50 p-3 rounded-lg">
                                        <p className="text-xs text-slate-400 mb-1">
                                            Tiers Active
                                        </p>
                                        <p className="font-semibold">
                                            {calculations.tier2KWh > 0
                                                ? "Tier 1 & 2"
                                                : "Tier 1"}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Breakdown Bar */}
                            {calculations.totalMonthlyKWh > 0 &&
                                settings.hasTier2 && (
                                    <div className="bg-slate-900 p-4 border-t border-slate-700">
                                        <div className="flex justify-between text-xs text-slate-400 mb-1">
                                            <span>
                                                Tier 1 (
                                                {calculations.tier1KWh.toFixed(
                                                    0,
                                                )}{" "}
                                                kWh)
                                            </span>
                                            {calculations.tier2KWh > 0 && (
                                                <span>
                                                    Tier 2 (
                                                    {calculations.tier2KWh.toFixed(
                                                        0,
                                                    )}{" "}
                                                    kWh)
                                                </span>
                                            )}
                                        </div>
                                        <div className="h-2 w-full bg-slate-700 rounded-full overflow-hidden flex">
                                            <div
                                                className="h-full bg-blue-500"
                                                style={{
                                                    width: `${(calculations.tier1KWh / calculations.totalMonthlyKWh) * 100}%`,
                                                }}
                                            ></div>
                                            {calculations.tier2KWh > 0 && (
                                                <div
                                                    className="h-full bg-red-500"
                                                    style={{
                                                        width: `${(calculations.tier2KWh / calculations.totalMonthlyKWh) * 100}%`,
                                                    }}
                                                ></div>
                                            )}
                                        </div>
                                    </div>
                                )}
                        </div>

                        {}
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
                                <div className="flex items-center space-x-2">
                                    <Calculator className="text-slate-400 w-5 h-5" />
                                    <h2 className="text-lg font-semibold text-slate-800">
                                        Your Appliances
                                    </h2>
                                </div>
                                <span className="bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full text-xs font-semibold">
                                    {appliances.length} items
                                </span>
                            </div>

                            {appliances.length === 0 ? (
                                <div className="text-center py-12 px-4">
                                    <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3">
                                        <Zap className="w-8 h-8 text-slate-300" />
                                    </div>
                                    <p className="text-slate-500">
                                        No appliances added yet.
                                    </p>
                                    <p className="text-sm text-slate-400 mt-1">
                                        Use the form to add your baseline usage
                                        or individual appliances.
                                    </p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="text-xs font-semibold text-slate-500 border-b border-slate-200">
                                                <th className="py-3 px-2">
                                                    Name
                                                </th>
                                                <th className="py-3 px-2">
                                                    Specs
                                                </th>
                                                <th className="py-3 px-2 text-right">
                                                    Energy (kWh)
                                                </th>
                                                <th className="py-3 px-2 text-right">
                                                    Est. Cost
                                                </th>
                                                <th className="py-3 px-2 text-center">
                                                    Action
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {calculations.enrichedAppliances.map(
                                                (app) => (
                                                    <tr
                                                        key={app.id}
                                                        className="hover:bg-slate-50 transition-colors"
                                                    >
                                                        <td className="py-3 px-2 font-medium text-slate-800">
                                                            {app.name}
                                                        </td>
                                                        <td className="py-3 px-2 text-sm text-slate-500">
                                                            {app.wattage}W{" "}
                                                            <br />
                                                            <span className="text-xs">
                                                                {app.assumedHrs}
                                                                h/d,{" "}
                                                                {
                                                                    app.assumedDays
                                                                }
                                                                d/mo
                                                            </span>
                                                        </td>
                                                        <td className="py-3 px-2 text-right text-sm font-semibold text-slate-700">
                                                            {app.calculatedKWh.toFixed(
                                                                1,
                                                            )}
                                                        </td>
                                                        <td className="py-3 px-2 text-right text-sm font-semibold text-slate-700">
                                                            $
                                                            {(
                                                                app.calculatedKWh *
                                                                calculations.effectiveRatePerKWh
                                                            ).toFixed(2)}
                                                        </td>
                                                        <td className="py-3 px-2 text-center">
                                                            <button
                                                                onClick={() =>
                                                                    removeAppliance(
                                                                        app.id,
                                                                    )
                                                                }
                                                                className="text-slate-400 hover:text-red-500 transition-colors p-1"
                                                                title="Remove"
                                                            >
                                                                <Trash2 className="w-4 h-4 mx-auto" />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ),
                                            )}
                                        </tbody>
                                    </table>

                                    <div className="mt-4 p-3 bg-blue-50 rounded-lg flex items-start space-x-2 border border-blue-100 text-xs text-blue-800">
                                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                        <p>
                                            <strong>
                                                Note on "Est. Cost":
                                            </strong>{" "}
                                            Because of tiered rates, adding new
                                            appliances changes the overall
                                            average cost per kWh. The estimated
                                            cost shown here uses your{" "}
                                            <strong>Blended Rate</strong> ($
                                            {calculations.effectiveRatePerKWh.toFixed(
                                                3,
                                            )}
                                            /kWh) to distribute the cost fairly
                                            across all items.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
