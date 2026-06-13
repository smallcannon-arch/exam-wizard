function hasGroupId(item) {
  return typeof item?.groupId === "string" && item.groupId.trim() !== "";
}

function getStandaloneGroupId(item, index) {
  const itemId =
    typeof item?.itemId === "string" && item.itemId.trim() !== ""
      ? item.itemId
      : `第 ${index + 1} 題`;

  return `__single__${index}__${itemId}`;
}

export function groupItemsByGroup(items) {
  if (!Array.isArray(items)) {
    return {
      ok: false,
      groups: [],
      errors: ["items 欄位必須是陣列。"],
    };
  }

  const groupMap = new Map();
  const groups = [];

  items.forEach((item, index) => {
    const groupId = hasGroupId(item)
      ? item.groupId.trim()
      : getStandaloneGroupId(item, index);
    const isStandalone = !hasGroupId(item);

    if (!groupMap.has(groupId)) {
      const group = {
        groupId: isStandalone ? "" : groupId,
        key: groupId,
        stimulus: typeof item?.stimulus === "string" ? item.stimulus : "",
        items: [],
        isStandalone,
      };
      groupMap.set(groupId, group);
      groups.push(group);
    }

    groupMap.get(groupId).items.push({ item, index });
  });

  return {
    ok: true,
    groups,
    errors: [],
  };
}
